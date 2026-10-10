-- #183: užsakovai ir jų ryšys su reisais.
--
-- Be užsakovo nematyti, kuris klientas uždirba daugiausia, o kuris tik užima
-- furas. Užsakovas neprivalomas: seni reisai ir importas lieka be jo.
--
-- Taikoma ranka Supabase SQL redaktoriuje. Be šios migracijos reisai saugomi
-- kaip anksčiau, tik be užsakovo.

-- Funkcija žemiau rašo ir `stops` (0012). Jei 0012 dar nepaleista, be šio
-- stulpelio reisų išsaugojimas lūžtų, todėl jis užtikrinamas ir čia (tas pats
-- sakinys kaip 0012, kartoti saugu).
alter table public.trips
  add column if not exists stops jsonb not null default '[]'::jsonb
  constraint trips_stops_is_array check (jsonb_typeof(stops) = 'array');

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_user_company_id()
    references public.companies (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 200),
  created_at timestamptz not null default now()
);

-- Tas pats užsakovas neturi atsirasti du kartus dėl didžiųjų raidžių ar tarpų.
create unique index if not exists customers_company_name_key
  on public.customers (company_id, lower(trim(name)));

-- Reikalingas sudėtiniam išoriniam raktui iš `trips`.
create unique index if not exists customers_company_id_id_key
  on public.customers (company_id, id);

alter table public.customers enable row level security;

drop policy if exists customers_company_access on public.customers;
create policy customers_company_access on public.customers
  for all to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());

grant select, insert, update, delete on public.customers to authenticated;

alter table public.trips add column if not exists customer_id uuid;

-- Sudėtinis raktas: reisas gali rodyti tik į savo įmonės užsakovą, net jei
-- kas nors atspėtų svetimo užsakovo id. Ištrynus užsakovą, reisai lieka, tik
-- be jo (išvalomas tik `customer_id`, ne `company_id`).
alter table public.trips drop constraint if exists trips_company_customer_fkey;
alter table public.trips
  add constraint trips_company_customer_fkey
  foreign key (company_id, customer_id)
  references public.customers (company_id, id)
  on delete set null (customer_id);

create index if not exists trips_customer_idx on public.trips (customer_id);

comment on table public.customers is
  'Užsakovai. Kiekviena įmonė mato tik savo.';
comment on column public.trips.customer_id is
  'Užsakovas (neprivalomas). Pelningumui pagal užsakovą.';

-- Tas pats save_trip_with_legs kaip 0012, plius `customer_id`.
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
      revenue_mode, rate_per_km, freight_price_cents, truck_costs, stops, customer_id
    ) values (
      input.trip_number, input.origin, input.destination, input.trip_date, input.truck_id,
      input.days, input.paid_km, input.empty_km, input.fuel_l_per_100km, input.fuel_price,
      input.adblue_l_per_100km, input.adblue_price, input.bridges_cents, input.ferries_cents,
      input.tunnels_cents, input.parking_cents, input.revenue_mode, input.rate_per_km,
      input.freight_price_cents, costs, input.stops, input.customer_id
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
      stops = input.stops, customer_id = input.customer_id
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
