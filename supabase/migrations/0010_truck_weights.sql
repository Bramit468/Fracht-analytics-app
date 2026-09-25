-- #86: vilkiko svoriai PTV kuro ir CO2e skaičiavimui.
--
-- PTV sąnaudas skaičiuoja pagal maršrutą (įkalnes, kelių tipus) ir masę.
-- Patikrinta su tikru raktu: pakeitus krovinio svorį nuo 20 t iki 5 t, tos
-- pačios kelionės Panevėžys–Oslas kuras krinta nuo 613 l iki 468 l. Vadinasi,
-- masė yra tikras veiksnys, o ne formalus laukas.
--
-- Abu laukai gali būti tušti. Spėti negalima: nežinomas svoris duotų tikslų
-- atrodantį, bet prasimanytą kuro skaičių.

alter table public.trucks
  add column if not exists empty_weight_kg integer
    check (empty_weight_kg is null or (empty_weight_kg between 1000 and 100000)),
  add column if not exists total_permitted_weight_kg integer
    check (total_permitted_weight_kg is null or (total_permitted_weight_kg between 1000 and 100000));

comment on column public.trucks.empty_weight_kg is
  'Vilkiko su priekaba svoris be krovinio, kg. Tuščia – nežinoma.';

comment on column public.trucks.total_permitted_weight_kg is
  'Leistina bendra masė, kg (paprastai 40 000). Tuščia – nežinoma.';
