-- #54: telematikos duomenų archyvas.
--
-- Tiekėjas grąžina slenkantį ~3 mėnesių langą ir `date_from` / `date_to`
-- parametrų neklauso (tikrinta #44). Senesni duomenys dingsta negrįžtamai,
-- todėl juos reikia nusirašyti pas save, kol dar yra.
--
-- Saugomos NEAPDOROTOS tiekėjo reikšmės, o ne suvestinės. Klasifikavimas
-- (lib/telematics-costs.ts `supplyKind`) dar keisis — šiandien atpažįstam
-- `maut`, rytoj dar ką nors. Turint neapdorotas eilutes praeitį galima
-- perskaičiuoti; turint tik suvestinę — nebe.

create table if not exists public.telematics_daily (
  company_id uuid not null default public.current_user_company_id()
    references public.companies (id) on delete restrict,
  plate text not null,
  date date not null,
  km numeric not null check (km >= 0),
  -- Dalis furų kuro daviklio neturi.
  fuel_l numeric check (fuel_l >= 0),
  fetched_at timestamptz not null default now(),
  primary key (company_id, plate, date)
);

create table if not exists public.telematics_supplies (
  company_id uuid not null default public.current_user_company_id()
    references public.companies (id) on delete restrict,
  -- Tiekėjo `ItemId`. Jis ir daro pakartotinį įrašymą saugų.
  item_id text not null,
  -- Numerio gali nebūti: tokie yra įmonės lygio pirkimai ir grąžinimai.
  -- Būtent jie iki #49 dingdavo be pėdsako, todėl archyve jie privalo būti.
  plate text,
  date date not null,
  type_title text,
  comment text,
  quantity numeric,
  -- Kaina laikoma tokia, kokią atsiuntė tiekėjas: gali būti neigiama
  -- (grąžinimai, PVM korekcijos) ir ne eurais.
  total_price numeric not null,
  currency text not null,
  country text,
  fetched_at timestamptz not null default now(),
  primary key (company_id, item_id)
);

comment on table public.telematics_daily is
  'Telematikos paros rida ir kuras. Neapdorotos reikšmės, kopija iš CANDaily.';

comment on table public.telematics_supplies is
  'Telematikos pirkimai. Neapdorotos reikšmės, kopija iš Supplies.';

create index if not exists telematics_daily_company_date_idx
  on public.telematics_daily (company_id, date desc);

create index if not exists telematics_supplies_company_date_idx
  on public.telematics_supplies (company_id, date desc);

alter table public.telematics_daily enable row level security;
alter table public.telematics_supplies enable row level security;

create policy telematics_daily_company_access on public.telematics_daily
  for all to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());

create policy telematics_supplies_company_access on public.telematics_supplies
  for all to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());

grant select, insert, update, delete
  on public.telematics_daily, public.telematics_supplies
  to authenticated;
