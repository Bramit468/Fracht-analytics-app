-- #187: dienpinigiai pagal šalis.
--
-- Įmonė nustato, kiek normos moka (50–100 %; `null` – funkcija išjungta,
-- lieka fiksuota furos paros suma). Reiso dienpinigiai užfiksuojami įrašant:
-- pasikeitus Vyriausybės normoms, seni reisai nepersiskaičiuoja – kaip ir
-- `truck_costs` kopija (0006).
--
-- Taikoma ranka Supabase SQL redaktoriuje, PO 0013 ir 0014.

alter table public.companies
  add column if not exists per_diem_percent numeric(5, 2)
  constraint companies_per_diem_percent_range
    check (per_diem_percent is null or (per_diem_percent >= 50 and per_diem_percent <= 100));

comment on column public.companies.per_diem_percent is
  'Kiek procentų Vyriausybės dienpinigių normos moka įmonė (50–100). null – dienpinigiai pagal šalis neskaičiuojami.';

-- Keisti gali tik savininkas: politika companies_update_own_owner (0013).
grant update (per_diem_percent) on public.companies to authenticated;

alter table public.trips
  add column if not exists per_diem_cents integer
    constraint trips_per_diem_cents_nonnegative check (per_diem_cents is null or per_diem_cents >= 0),
  add column if not exists per_diem_days jsonb
    constraint trips_per_diem_days_is_array check (per_diem_days is null or jsonb_typeof(per_diem_days) = 'array');

comment on column public.trips.per_diem_cents is
  'Dienpinigiai pagal šalis visam reisui, centais. null – fiksuoti furos dienpinigiai × paros.';
comment on column public.trips.per_diem_days is
  'Kiekvienos dienos šalys ir suma: [{"countries": ["PL","DE"], "cents": 5500}].';

-- Funkcija žemiau rašo ir `stops` (0012) bei `customer_id` (0014). Jei jos
-- dar nepaleistos, be šių stulpelių reisų išsaugojimas lūžtų.
alter table public.trips
  add column if not exists stops jsonb not null default '[]'::jsonb;
alter table public.trips
  add column if not exists customer_id uuid;

-- Tas pats save_trip_with_legs kaip 0014, plius dienpinigiai.
create or replace function public.save_trip_with_legs(trip_data jsonb, legs_data jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  saved public.trips;
  input public.trips;
  saved_legs jsonb;
  costs jsonb;
begin
  if jsonb_typeof(legs_data) is distinct from 'array' then
    raise exception 'legs_data must be an array';
  end if;
  input := jsonb_populate_record(null::public.trips, trip_data);
  -- Nepaduoti sustojimai reiškia „nėra“, o ne null, kurį atmestų apribojimas.
  input.stops := coalesce(input.stops, '[]'::jsonb);

  -- Kliento atsiųstas truck_costs ignoruojamas sąmoningai. Taisant reisą
  -- kopija perrašoma: taisomas reisas, vadinasi taisomi ir jo kaštai.
  costs := public.truck_cost_snapshot(input.truck_id);
  if costs is null then
    raise exception 'Unknown truck';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(legs_data) as leg(country text, km numeric)
    where not exists (select 1 from public.country_tariffs t where t.country = leg.country)
  ) then
    raise exception 'Unknown country tariff';
  end if;

  if input.id is null then
    insert into public.trips (
      trip_number, origin, destination, trip_date, truck_id, days, paid_km, empty_km,
      fuel_l_per_100km, fuel_price, adblue_l_per_100km, adblue_price,
      bridges_cents, ferries_cents, tunnels_cents, parking_cents,
      revenue_mode, rate_per_km, freight_price_cents, truck_costs, stops, customer_id,
      per_diem_cents, per_diem_days
    ) values (
      input.trip_number, input.origin, input.destination, input.trip_date, input.truck_id,
      input.days, input.paid_km, input.empty_km, input.fuel_l_per_100km, input.fuel_price,
      input.adblue_l_per_100km, input.adblue_price, input.bridges_cents, input.ferries_cents,
      input.tunnels_cents, input.parking_cents, input.revenue_mode, input.rate_per_km,
      input.freight_price_cents, costs, input.stops, input.customer_id,
      input.per_diem_cents, input.per_diem_days
    ) returning * into saved;
  else
    update public.trips set
      trip_number = input.trip_number, origin = input.origin, destination = input.destination,
      trip_date = input.trip_date, truck_id = input.truck_id, days = input.days,
      paid_km = input.paid_km, empty_km = input.empty_km,
      fuel_l_per_100km = input.fuel_l_per_100km, fuel_price = input.fuel_price,
      adblue_l_per_100km = input.adblue_l_per_100km, adblue_price = input.adblue_price,
      bridges_cents = input.bridges_cents, ferries_cents = input.ferries_cents,
      tunnels_cents = input.tunnels_cents, parking_cents = input.parking_cents,
      revenue_mode = input.revenue_mode, rate_per_km = input.rate_per_km,
      freight_price_cents = input.freight_price_cents, truck_costs = costs,
      stops = input.stops, customer_id = input.customer_id,
      per_diem_cents = input.per_diem_cents, per_diem_days = input.per_diem_days
    where id = input.id
    returning * into saved;

    if saved.id is null then
      raise exception 'Trip not found';
    end if;

    -- Senos atkarpos pakeičiamos naujomis, o ne pridedamos prie jų.
    delete from public.trip_country_legs where trip_id = saved.id;
  end if;

  insert into public.trip_country_legs(trip_id, country, km)
    select saved.id, leg.country, leg.km
    from jsonb_to_recordset(legs_data) as leg(country text, km numeric);
  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into saved_legs
    from public.trip_country_legs l where l.trip_id = saved.id;
  return to_jsonb(saved) || jsonb_build_object('legs', saved_legs);
end;
$$;
