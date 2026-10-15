-- Priekaba dalinama iš vidutinio kalendorinio mėnesio, ne iš 22 darbo dienų.
--
-- Paros kaštai įvedami kaip metų suma / 365, t. y. kalendorinė para: fura
-- kainuoja ir stovėdama. Priekabos nuoma buvo dalinama iš 22, todėl 30 parų
-- reisuose ji būdavo įskaičiuota 136 %. Dabar – × 12 / 365, kaip ir lib/truck.ts.
--
-- Seni reisai nekeičiami: jų truck_costs kopijoje lieka 22.
-- `working_days_per_month` stulpelis nebenaudojamas, bet paliktas, kad senas
-- kodas, jei ši migracija paleista anksčiau už diegimą, vis dar galėtų įrašyti furą.

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
      'driverSalary', t.driver_salary_cents,
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

comment on column public.trucks.working_days_per_month is
  'Nebenaudojama nuo 0017: priekaba dalinama iš 365 / 12. Galima ištrinti.';
