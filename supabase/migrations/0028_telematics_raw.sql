-- Telematikos užsakymų ir kelionių archyvas – visi laukai, neapdoroti.
--
-- Orders ir Trips srautai siekia tik ~1 mėnesį, o Bramit iš jų skaito tik
-- dalį laukų. Ko neišsaugosim, dings: pvz. ar Telematikoje yra krovinio
-- svoris – be jo PTV kuro prognozė klysta +41 % (2026-11-01 patikra). Todėl
-- saugoma visa eilutė (`payload`), o ką iš jos imti, sprendžiama vėliau.
--
-- Rašo archyvavimo mygtukas su vartotojo teisėmis (RLS), kaip 0008.

create table if not exists public.telematics_raw (
  company_id uuid not null default public.current_user_company_id()
    references public.companies (id) on delete cascade,
  feed text not null check (feed in ('orders', 'trips')),
  -- Tiekėjo raktas: užsakymui `OrderId`, kelionei – jos ID arba užsakymas + laikai.
  item_key text not null check (length(item_key) between 1 and 200),
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (company_id, feed, item_key)
);

create index if not exists telematics_raw_company_feed_idx
  on public.telematics_raw (company_id, feed, fetched_at desc);

alter table public.telematics_raw enable row level security;

drop policy if exists telematics_raw_company_access on public.telematics_raw;
create policy telematics_raw_company_access on public.telematics_raw
  for all to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());

revoke all on public.telematics_raw from anon;
grant select, insert, update, delete on public.telematics_raw to authenticated;

comment on table public.telematics_raw is
  'Telematikos Orders ir Trips eilutės be apdorojimo – visi laukai (jsonb).';
