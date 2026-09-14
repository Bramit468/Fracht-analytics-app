-- Reiso duomenų modelis (#3).
--
-- Modelis aprašytas docs/skaiciavimo-modelis.md
--
-- Numeracija: 0001 rezervuotas trucks lentelei (#17), 0002 country_tariffs
-- lentelei (#18). Ši migracija remiasi į trucks, todėl be #17 nepritaikoma.
--
-- Skaičių taisyklė:
--   pinigų sumos       -> integer, centai
--   įkainiai ir normos -> numeric(10,4)
--   kilometrai         -> numeric(12,2)

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),

  trip_number text not null,
  origin text not null,
  destination text not null,
  trip_date date not null,

  truck_id uuid not null references public.trucks (id) on delete restrict,

  -- kiek parų truko reisas; dauginama iš furos paros savikainos
  days integer not null check (days > 0),

  -- apmokami km neša pajamas, tušti tik degina kurą
  paid_km numeric(12,2) not null check (paid_km >= 0),
  empty_km numeric(12,2) not null default 0 check (empty_km >= 0),

  fuel_l_per_100km numeric(10,4) not null check (fuel_l_per_100km >= 0),
  fuel_price numeric(10,4) not null check (fuel_price >= 0),
  adblue_l_per_100km numeric(10,4) not null default 0 check (adblue_l_per_100km >= 0),
  adblue_price numeric(10,4) not null default 0 check (adblue_price >= 0),

  -- atskiri kelio mokesčiai, centais
  bridges_cents integer not null default 0 check (bridges_cents >= 0),
  ferries_cents integer not null default 0 check (ferries_cents >= 0),
  tunnels_cents integer not null default 0 check (tunnels_cents >= 0),
  parking_cents integer not null default 0 check (parking_cents >= 0),

  -- pajamos gaunamos vienu iš dviejų būdų
  revenue_mode text not null check (revenue_mode in ('per_km', 'freight')),
  rate_per_km numeric(10,4) check (rate_per_km >= 0),
  freight_price_cents integer check (freight_price_cents >= 0),

  created_at timestamptz not null default now(),

  -- Pasirinktas būdas privalo turėti savo reikšmę, o nepasirinktas neturi jos
  -- turėti. Be šito lentelėje atsirastų reisų, kuriems pajamų suskaičiuoti
  -- neįmanoma, ir tai paaiškėtų tik ekrane.
  constraint trips_revenue_mode_has_value check (
    (revenue_mode = 'per_km' and rate_per_km is not null and freight_price_cents is null)
    or
    (revenue_mode = 'freight' and freight_price_cents is not null and rate_per_km is null)
  )
);

comment on table public.trips is
  'Vienas reisas. Kaštai ir pelnas skaičiuojami lib/calc.ts, ne duomenų bazėje.';

-- Reisas važiuoja per kelias šalis, todėl atkarpos laikomos atskirai.
-- Kelių kaštai sudedami ciklu per visas eilutes (zr. lib/calc.ts).
create table if not exists public.trip_country_legs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  country text not null,
  km numeric(12,2) not null check (km >= 0)
);

comment on table public.trip_country_legs is
  'Reiso atkarpa vienoje šalyje. Įkainis imamas iš country_tariffs pagal country.';

create index if not exists trip_country_legs_trip_id_idx
  on public.trip_country_legs (trip_id);

create index if not exists trips_trip_date_idx
  on public.trips (trip_date desc);

-- RLS įjungiamas iš karto. Anon raktas matomas naršyklėje, todėl be RLS
-- lentelės būtų atviros bet kam, kas atsidaro puslapio kodą.
alter table public.trips enable row level security;
alter table public.trip_country_legs enable row level security;

-- LAIKINA taisyklė, kad app'as veiktų, kol nėra prisijungimo.
-- Ji leidžia viską bet kam, kas turi anon raktą — tai tinka tik kūrimo metui.
-- Prieš pirmą klientą abi šitas taisykles PAŠALINTI ir pakeisti tokiomis,
-- kurios rodo tik savo įmonės reisus.
create policy trips_temporary_open_access on public.trips
  for all using (true) with check (true);

create policy trip_country_legs_temporary_open_access on public.trip_country_legs
  for all using (true) with check (true);
