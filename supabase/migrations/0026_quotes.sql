-- Phase 0, 5 punktas: pasiūlymų žurnalas su rezultatais.
--
-- Kiekvienas suskaičiuotas pasiūlymas: ką siūlė užsakovas, ką sakė Bramit
-- (skaičiai užšaldomi sprendimo metu – modelis keisis, o istorija turi likti),
-- ką nusprendė dispečeris ir kuo baigėsi. Be to nepamatuosi, ar skaičiuoklė
-- naudojama (Gate 0: 100 pasiūlymų) ir ar jos verdiktai pasitvirtina.
--
-- Užsakovas, fura ir reisas – sudėtiniais raktais su `company_id`, kaip `trips`:
-- įrašas negali rodyti į kitos įmonės objektą, net atspėjus jo id.

-- Reikalingas sudėtiniam raktui iš `quotes` (id ir taip unikalus).
create unique index if not exists trips_company_id_id_key on public.trips (company_id, id);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_user_company_id()
    references public.companies (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  truck_id uuid,
  trip_date date,
  stops jsonb not null default '[]'::jsonb constraint quotes_stops_is_array check (jsonb_typeof(stops) = 'array'),
  origin text not null default '',
  destination text not null default '',
  customer_id uuid,
  source text not null default 'manual' check (source in ('manual', 'timocom', 'transeu', 'unknown')),
  offer_text text check (offer_text is null or length(offer_text) <= 4000),
  offered_price_cents integer check (offered_price_cents is null or offered_price_cents >= 0),

  paid_km numeric(12, 2) check (paid_km is null or paid_km >= 0),
  empty_km numeric(12, 2) check (empty_km is null or empty_km >= 0),
  days numeric(8, 3) check (days is null or days >= 0),
  total_cost_cents integer,
  contribution_cents integer,
  contribution_per_day_cents integer,
  verdict text check (verdict is null or verdict in ('take', 'negotiate', 'reject')),
  target_price_cents integer,

  decision text not null default 'pending' check (decision in ('pending', 'taken', 'negotiating', 'declined')),
  outcome text not null default 'open' check (outcome in ('open', 'won', 'lost')),
  final_price_cents integer check (final_price_cents is null or final_price_cents >= 0),
  reason text check (reason is null or length(reason) <= 500),
  trip_id uuid,

  constraint quotes_company_truck_fkey foreign key (company_id, truck_id)
    references public.trucks (company_id, id) on delete set null (truck_id),
  constraint quotes_company_customer_fkey foreign key (company_id, customer_id)
    references public.customers (company_id, id) on delete set null (customer_id),
  constraint quotes_company_trip_fkey foreign key (company_id, trip_id)
    references public.trips (company_id, id) on delete set null (trip_id)
);

create index if not exists quotes_company_created_idx on public.quotes (company_id, created_at desc);

create or replace function public.quotes_touch_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists quotes_touch_updated_at on public.quotes;
create trigger quotes_touch_updated_at before update on public.quotes
  for each row execute function public.quotes_touch_updated_at();

alter table public.quotes enable row level security;

-- Skaityti, rašyti ir taisyti – visi įmonės nariai; trinti – tik savininkas:
-- žurnalas yra įrodymas, jo neturi būti galima tyliai išvalyti.
drop policy if exists quotes_company_select on public.quotes;
create policy quotes_company_select on public.quotes
  for select to authenticated
  using (company_id = public.current_user_company_id());

drop policy if exists quotes_company_insert on public.quotes;
create policy quotes_company_insert on public.quotes
  for insert to authenticated
  with check (company_id = public.current_user_company_id());

drop policy if exists quotes_company_update on public.quotes;
create policy quotes_company_update on public.quotes
  for update to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());

drop policy if exists quotes_owner_delete on public.quotes;
create policy quotes_owner_delete on public.quotes
  for delete to authenticated
  using (
    company_id = public.current_user_company_id()
    and exists (
      select 1 from public.company_members m
      where m.company_id = quotes.company_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

-- Anon teisių nėra: 0025 pamoka.
revoke all on public.quotes from anon;
grant select, insert, update, delete on public.quotes to authenticated;

comment on table public.quotes is
  'Pasiūlymų žurnalas: Bramit verdiktas, dispečerio sprendimas ir rezultatas. Kiekviena įmonė mato tik savo.';
