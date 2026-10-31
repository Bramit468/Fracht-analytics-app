-- Phase 0, 6 punktas: įmonės sutartinės keltų kainos.
--
-- Viešų krovininių keltų tarifų beveik nėra (išskyrus Scandlines Rostock–Gedser),
-- o tikra kaina – vežėjo sutartis su DFDS, Stena, TT-Line ir t. t. Baltijos keltų
-- bilietai Telematikos pirkimuose nematyti (jie apmokami sąskaita), todėl kaina
-- įvedama čia, o skaičiuoklė ją ima, kai PTV maršrute aptinka tą keltą.
--
-- Kaina – vienam plaukimui: vilkikas su puspriekabe ir vairuotoju.

create table if not exists public.ferry_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_user_company_id()
    references public.companies (id) on delete cascade,
  -- „Klaipėda – Karlshamn“: uostai iš pavadinimo lyginami su PTV kelto pavadinimu.
  label text not null check (length(trim(label)) between 3 and 80),
  price_cents integer not null check (price_cents > 0),
  note text check (note is null or length(note) <= 200),
  updated_at timestamptz not null default now()
);

create unique index if not exists ferry_rates_company_label_key
  on public.ferry_rates (company_id, lower(trim(label)));

alter table public.ferry_rates enable row level security;

-- Mato visi įmonės nariai (skaičiuoklei), keičia tik savininkas – kaip kitus įmonės nustatymus.
drop policy if exists ferry_rates_company_select on public.ferry_rates;
create policy ferry_rates_company_select on public.ferry_rates
  for select to authenticated
  using (company_id = public.current_user_company_id());

drop policy if exists ferry_rates_owner_write on public.ferry_rates;
create policy ferry_rates_owner_write on public.ferry_rates
  for all to authenticated
  using (
    company_id = public.current_user_company_id()
    and exists (
      select 1 from public.company_members m
      where m.company_id = ferry_rates.company_id and m.user_id = auth.uid() and m.role = 'owner'
    )
  )
  with check (
    company_id = public.current_user_company_id()
    and exists (
      select 1 from public.company_members m
      where m.company_id = ferry_rates.company_id and m.user_id = auth.uid() and m.role = 'owner'
    )
  );

revoke all on public.ferry_rates from anon;
grant select, insert, update, delete on public.ferry_rates to authenticated;

comment on table public.ferry_rates is
  'Įmonės sutartinės keltų kainos vienam plaukimui (vilkikas + puspriekabė + vairuotojas).';
