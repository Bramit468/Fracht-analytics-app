-- Šalių kelių įkainių žinynas (#18).
--
-- Įkainio rūšis laikoma atskirai, nes iš skaičiaus dydžio jos nustatyti negalima.

create table if not exists public.country_tariffs (
  id uuid primary key default gen_random_uuid(),
  country text not null unique,
  rate numeric(10,4) not null check (rate >= 0),
  rate_type text not null check (rate_type in ('per_km', 'flat'))
);

comment on table public.country_tariffs is
  'Kelių įkainiai pagal šalį: tarifas už kilometrą arba fiksuotas mokestis.';

alter table public.country_tariffs enable row level security;

-- LAIKINA taisyklė iki autentifikacijos ir įmonių atskyrimo įdiegimo.
create policy country_tariffs_temporary_open_access on public.country_tariffs
  for all using (true) with check (true);

insert into public.country_tariffs (country, rate, rate_type)
values
  ('Austrija', 0.5317, 'per_km'),
  ('Belgija', 0.3200, 'per_km'),
  ('Švedija', 4.2000, 'flat'),
  ('Norvegija', 0.0900, 'per_km'),
  ('Vokietija', 0.3480, 'per_km'),
  ('Olandija', 4.2000, 'flat'),
  ('Ispanija', 0.2000, 'per_km'),
  ('Italija', 0.1900, 'per_km'),
  ('Danija', 0.0700, 'per_km'),
  ('Prancūzija', 0.3200, 'per_km'),
  ('Čekija', 0.2200, 'per_km'),
  ('Lenkija', 0.3500, 'per_km'),
  ('Liuksemburgas', 4.2000, 'flat'),
  ('Nemokami', 0.0000, 'per_km')
on conflict (country) do update
set rate = excluded.rate,
    rate_type = excluded.rate_type;
