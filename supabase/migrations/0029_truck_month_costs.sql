-- Faktiškai sumokėti furos kaštai per mėnesį (vartotojo sprendimas, 2026-11-19).
--
-- Reisų pelnas skaičiuojamas iš normų (furos paros kaštai × krovinio paros).
-- Furos ataskaita suvestinėje palygina jį su tuo, kas iš tikrųjų sumokėta per
-- mėnesį – su prastovomis, savaitgaliais ir viskuo, ko joks reisas neneša.
--
-- Kuras, AdBlue ir kelių rinkliavos čia neįvedami: jie jau yra reisų kaštuose
-- (ir faktiškai matomi iš Telematikos), antrą kartą jų skaičiuoti negalima.
--
-- Eilutė yra – mėnuo įvestas; tuščias laukas = 0 €.

create table if not exists public.truck_month_costs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_user_company_id()
    references public.companies (id) on delete cascade,
  truck_id uuid not null references public.trucks (id) on delete cascade,
  -- Pirma mėnesio diena.
  month date not null check (extract(day from month) = 1),
  driver_cents integer not null default 0 check (driver_cents >= 0),
  leasing_cents integer not null default 0 check (leasing_cents >= 0),
  insurance_cents integer not null default 0 check (insurance_cents >= 0),
  vehicle_tax_cents integer not null default 0 check (vehicle_tax_cents >= 0),
  repairs_cents integer not null default 0 check (repairs_cents >= 0),
  tires_cents integer not null default 0 check (tires_cents >= 0),
  overhead_cents integer not null default 0 check (overhead_cents >= 0),
  other_cents integer not null default 0 check (other_cents >= 0),
  updated_at timestamptz not null default now(),
  unique (truck_id, month)
);

alter table public.truck_month_costs enable row level security;

-- Kaip furos: mato ir keičia visi įmonės nariai.
drop policy if exists truck_month_costs_company_access on public.truck_month_costs;
create policy truck_month_costs_company_access on public.truck_month_costs
  for all to authenticated
  using (company_id = public.current_user_company_id())
  with check (
    company_id = public.current_user_company_id()
    and exists (select 1 from public.trucks t where t.id = truck_id and t.company_id = public.current_user_company_id())
  );

revoke all on public.truck_month_costs from anon;
grant select, insert, update, delete on public.truck_month_costs to authenticated;

comment on table public.truck_month_costs is
  'Faktiškai sumokėti furos kaštai per mėnesį (be kuro, AdBlue ir kelių rinkliavų – jie reisuose).';
