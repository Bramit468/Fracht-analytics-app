-- #44: telematikos momentinių duomenų istorija.
--
-- Viena nuotrauka nieko nepasako: tiekėjo `Odometer` ir `FuelConsumption` yra
-- kaupiamieji skaitikliai, o `Country` — tik dabartinė šalis. Reiso km, kuras
-- ir šalių atkarpos gaunami iš nuotraukų sekos, todėl ją reikia kaupti.
--
-- gps_time laikomas be laiko zonos, tiksliai toks, kokį atsiunčia tiekėjas
-- ("2026-09-22 19:06:44"). Kol nežinoma, kurioje zonoje jis skaičiuojamas,
-- vertimas į timestamptz tik iškreiptų duomenis.

create table if not exists public.telematics_snapshots (
  company_id uuid not null default public.current_user_company_id()
    references public.companies (id) on delete cascade,

  -- Tiekėjo objekto ID. Su furomis siejama per numerį, nes tas pats vilkikas
  -- pakeitus įrenginį gauna naują object_id.
  object_id text not null,
  plate text not null,

  gps_time timestamp not null,

  -- Šalis ISO3. Gali nebūti, jei objektas dar nespėjo nustatyti vietos.
  country text,
  ignition boolean not null,

  -- Kaupiamieji skaitikliai. Dalis furų kuro daviklio neturi, o pakeitus
  -- įrenginį odometras prasideda iš naujo — abu atvejai tikrinami skaičiuojant.
  odometer_km numeric(12,3),
  fuel_l numeric(12,3),

  created_at timestamptz not null default now(),

  primary key (company_id, object_id, gps_time)
);

comment on table public.telematics_snapshots is
  'Telematikos nuotraukos. Reisų duomenys skaičiuojami iš dviejų nuotraukų skirtumo.';

create index if not exists telematics_snapshots_plate_time_idx
  on public.telematics_snapshots (company_id, plate, gps_time desc);

alter table public.telematics_snapshots enable row level security;

create policy telematics_snapshots_company_access on public.telematics_snapshots
  for all to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());

grant select, insert, delete on public.telematics_snapshots to authenticated;
