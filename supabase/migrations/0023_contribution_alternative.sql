-- Sprendimas „imti ar neimti“: su kuo krovinys buvo lyginamas.
--
-- `alternative_days` ir `alternative_cents` – ką fura darytų be šio krovinio
-- (0 ir 0 – stovėtų; grįžimas tuščiam – paros ir minusas kuras su keliais).
-- Saugoma prie reiso, kad atidarius jį vėliau verdiktas būtų tas pats, kuriuo
-- remtasi priimant krovinį.
--
-- `companies.min_contribution_cents` – kiek įnašas turi viršyti alternatyvą,
-- kad verta imti. Įmonės sprendimas kaip ir minimali marža; `null` – 0.
--
-- Taikoma ranka Supabase SQL redaktoriuje. Be jos reisai įrašomi kaip anksčiau,
-- tik alternatyva neišsaugoma, o ribos nustatyti negalima.

alter table public.trips
  add column if not exists alternative_days numeric(8, 3) not null default 0
    constraint trips_alternative_days_nonnegative check (alternative_days >= 0),
  add column if not exists alternative_cents integer not null default 0;

comment on column public.trips.alternative_days is
  'Kiek parų fura užimtų alternatyva (be šio krovinio). 0 – stovėtų.';
comment on column public.trips.alternative_cents is
  'Alternatyvos įnašas centais; grįžimas tuščiam – neigiamas.';

alter table public.companies
  add column if not exists min_contribution_cents integer;

comment on column public.companies.min_contribution_cents is
  'Kiek centų įnašas turi viršyti alternatyvą, kad krovinį verta imti. null – 0.';

-- Kaip 0013: keisti tik šį stulpelį ir tik savininkui (politika jau yra).
grant update (min_contribution_cents) on public.companies to authenticated;

-- Tas pats save_trip_with_legs kaip 0021, plius alternatyva.
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
      per_diem_cents, per_diem_days, telematika_order_id, import_snapshot,
      alternative_days, alternative_cents
    ) values (
      input.trip_number, input.origin, input.destination, input.trip_date, input.truck_id,
      input.days, input.paid_km, input.empty_km, input.fuel_l_per_100km, input.fuel_price,
      input.adblue_l_per_100km, input.adblue_price, input.bridges_cents, input.ferries_cents,
      input.tunnels_cents, input.parking_cents, input.revenue_mode, input.rate_per_km,
      input.freight_price_cents, costs, input.stops, input.customer_id,
      input.per_diem_cents, input.per_diem_days, input.telematika_order_id, input.import_snapshot,
      coalesce(input.alternative_days, 0), coalesce(input.alternative_cents, 0)
    ) returning * into saved;
  else
    -- Taisant ranka `telematika_order_id` nepaduodamas – ryšys su užsakymu lieka.
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
      per_diem_cents = input.per_diem_cents, per_diem_days = input.per_diem_days,
      telematika_order_id = coalesce(input.telematika_order_id, telematika_order_id),
      -- Taisant ranka kopija nepaduodama ir lieka: iš jos importas mato, kas taisyta.
      import_snapshot = coalesce(input.import_snapshot, import_snapshot),
      -- Importas alternatyvos nepaduoda – lieka ta, kuria remtasi priimant krovinį.
      alternative_days = coalesce(input.alternative_days, alternative_days),
      alternative_cents = coalesce(input.alternative_cents, alternative_cents)
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
