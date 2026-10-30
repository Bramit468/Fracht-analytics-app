-- Nebenaudojamas `trucks.working_days_per_month` pašalinamas.
--
-- Nuo 0017 priekabos ir atlyginimo paros kaina skaičiuojama iš 365 / 12, o
-- `truck_cost_snapshot()` šio stulpelio nebeskaito. Palikta jis tik klaidino,
-- lyg nuo jo kas nors priklausytų. Senų reisų `truck_costs` kopijos turi savo
-- `workingDaysPerMonth` reikšmę ir nesikeičia.
--
-- Taikoma ranka Supabase SQL redaktoriuje. Jei kuris nors objektas dar nuo
-- stulpelio priklauso, `drop column` meta klaidą ir nieko nekeičia.

alter table public.trucks drop column if exists working_days_per_month;
