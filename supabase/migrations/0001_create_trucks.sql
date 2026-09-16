-- Furos paros savikainos modelis (#17).
--
-- Visos pinigų sumos laikomos centais. Priekabos nuoma įvedama mėnesiui,
-- o lib/calc.ts ją padalina iš working_days_per_month.

create table if not exists public.trucks (
  id uuid primary key default gen_random_uuid(),
  plate text not null unique,

  depreciation_cents integer not null default 0 check (depreciation_cents >= 0),
  interest_cents integer not null default 0 check (interest_cents >= 0),
  insurance_kasko_cents integer not null default 0 check (insurance_kasko_cents >= 0),
  insurance_civil_cents integer not null default 0 check (insurance_civil_cents >= 0),
  insurance_cmr_cents integer not null default 0 check (insurance_cmr_cents >= 0),
  driver_salary_cents integer not null default 0 check (driver_salary_cents >= 0),
  per_diem_cents integer not null default 0 check (per_diem_cents >= 0),
  repairs_cents integer not null default 0 check (repairs_cents >= 0),
  management_cents integer not null default 0 check (management_cents >= 0),
  trailer_monthly_cents integer not null default 0 check (trailer_monthly_cents >= 0),
  working_days_per_month integer not null default 22 check (working_days_per_month > 0)
);

comment on table public.trucks is
  'Furos paros savikainos dedamosios. Sumos laikomos centais.';

alter table public.trucks enable row level security;

-- LAIKINA taisyklė iki autentifikacijos ir įmonių atskyrimo įdiegimo.
create policy trucks_temporary_open_access on public.trucks
  for all using (true) with check (true);
