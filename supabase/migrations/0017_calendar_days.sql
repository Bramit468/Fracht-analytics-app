-- Priekaba dalinama iš vidutinio kalendorinio mėnesio, ne iš 22 darbo dienų,
-- o vairuotojo atlyginimas įvedamas per mėnesį.
--
-- Paros kaštai įvedami kaip metų suma / 365, t. y. kalendorinė para: fura
-- kainuoja ir stovėdama. Priekabos nuoma buvo dalinama iš 22, todėl 30 parų
-- reisuose ji būdavo įskaičiuota 136 %. Dabar – × 12 / 365, kaip ir lib/truck.ts.
--
-- Atlyginimas paroje – mėn. × 12 / 365, ta pati formulė kaip lib/truck.ts
-- `truckRowToCalc`. Esamos paros sumos (metų suma / 365) verčiamos atgal į
-- mėnesio: × 365 / 12. Atgal į parą jos grįžta tos pačios iki cento.
--
-- Seni reisai nekeičiami: jų truck_costs kopijoje lieka 22 ir paros atlyginimas.
-- `working_days_per_month` stulpelis nebenaudojamas, bet paliktas.
--
-- Paleisti iš karto po diegimo: kol paleista nebus, naujas kodas furų neįrašys
-- (nėra `driver_salary_monthly_cents`).

alter table public.trucks rename column driver_salary_cents to driver_salary_monthly_cents;
update public.trucks
  set driver_salary_monthly_cents = round(driver_salary_monthly_cents * 365 / 12.0);

create or replace function public.truck_cost_snapshot(p_truck_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'dailyCents', jsonb_build_object(
      'depreciation', t.depreciation_cents,
      'interest', t.interest_cents,
      'insuranceKasko', t.insurance_kasko_cents,
      'insuranceCivil', t.insurance_civil_cents,
      'insuranceCmr', t.insurance_cmr_cents,
      'driverSalary', round(t.driver_salary_monthly_cents * 12 / 365.0)::integer,
      'perDiem', t.per_diem_cents,
      'repairs', t.repairs_cents,
      'management', t.management_cents
    ),
    'trailerMonthlyCents', t.trailer_monthly_cents,
    'workingDaysPerMonth', 365.0 / 12
  )
  from public.trucks t
  where t.id = p_truck_id;
$$;

comment on column public.trucks.driver_salary_monthly_cents is
  'Visų furos vairuotojų atlyginimas su mokesčiais per mėnesį, centais. Paroje – × 12 / 365.';

comment on column public.trucks.working_days_per_month is
  'Nebenaudojama nuo 0017: priekaba dalinama iš 365 / 12. Galima ištrinti.';
