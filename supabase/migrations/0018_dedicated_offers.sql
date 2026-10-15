-- Dedikuoti pasiūlymai: fura su vairuotoju vienam užsakovui visą mėnesį.
--
-- Skaičiavimas – lib/dedicated.ts. Čia saugomi tik įvesti skaičiai ir derybų
-- atsakymai; furos paros savikaina įrašoma pasiūlymo metu, kad vėliau
-- pakeitus furos kaštus senas pasiūlymas nepasikeistų.
--
-- Taikoma ranka Supabase SQL redaktoriuje. Be šios migracijos puslapis
-- „Dedikuoti" skaičiuoja, bet neįrašo.

create table if not exists public.dedicated_offers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_user_company_id()
    references public.companies (id) on delete cascade,
  created_at timestamptz not null default now(),

  title text not null check (length(trim(title)) between 1 and 200),
  customer text check (customer is null or length(customer) <= 200),
  truck_id uuid references public.trucks (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'rejected')),

  truck_daily_cents integer not null check (truck_daily_cents > 0),
  paid_km_month numeric(12, 2) not null check (paid_km_month > 0),
  empty_km_month numeric(12, 2) not null default 0 check (empty_km_month >= 0),
  fuel_l_per_100km numeric(10, 4) not null default 0 check (fuel_l_per_100km >= 0),
  fuel_price numeric(10, 4) not null default 0 check (fuel_price >= 0),
  adblue_l_per_100km numeric(10, 4) not null default 0 check (adblue_l_per_100km >= 0),
  adblue_price numeric(10, 4) not null default 0 check (adblue_price >= 0),
  toll_per_km numeric(10, 4) not null default 0 check (toll_per_km >= 0),

  pricing_model text not null check (pricing_model in ('fixed_plus_km', 'km_with_min')),
  monthly_fee_cents integer not null default 0 check (monthly_fee_cents >= 0),
  rate_per_km numeric(10, 4) not null default 0 check (rate_per_km >= 0),
  min_km_month numeric(12, 2) not null default 0 check (min_km_month >= 0),
  margin_percent numeric(5, 2) not null default 0 check (margin_percent >= 0 and margin_percent < 100),

  terms jsonb not null default '{}'::jsonb check (jsonb_typeof(terms) = 'object'),
  notes text check (notes is null or length(notes) <= 2000)
);

create index if not exists dedicated_offers_company_idx
  on public.dedicated_offers (company_id, created_at desc);

alter table public.dedicated_offers enable row level security;

drop policy if exists dedicated_offers_company_access on public.dedicated_offers;
create policy dedicated_offers_company_access on public.dedicated_offers
  for all to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());

grant select, insert, update, delete on public.dedicated_offers to authenticated;

comment on table public.dedicated_offers is
  'Dedikuoti pasiūlymai (mėnesio fura su vairuotoju). Kiekviena įmonė mato tik savo.';
