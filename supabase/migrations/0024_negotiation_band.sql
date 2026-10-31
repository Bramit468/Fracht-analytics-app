-- Vieno ekrano pasiūlymas: „Imti / Derėtis iki X € / Neimti“.
--
-- `companies.negotiation_band_percent` – kiek procentų virš pasiūlytos kainos
-- dar verta derėtis. Jei savikaina (X) viršija kainą daugiau – „Neimti“.
-- `null` – programa naudoja 15 %.
--
-- Taikoma ranka Supabase SQL redaktoriuje, PO 0023. Be jos forma veikia su 15 %,
-- tik ribos pakeisti negalima.

alter table public.companies
  add column if not exists negotiation_band_percent numeric(5, 2)
  constraint companies_negotiation_band_range
    check (negotiation_band_percent is null or (negotiation_band_percent >= 0 and negotiation_band_percent <= 100));

comment on column public.companies.negotiation_band_percent is
  'Kiek % virš pasiūlytos kainos dar verta derėtis (0–100). null – 15 %.';

-- Keisti gali tik savininkas: politika companies_update_own_owner (0013).
grant update (negotiation_band_percent) on public.companies to authenticated;
