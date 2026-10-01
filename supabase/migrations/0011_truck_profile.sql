-- #164: furos kortelė – viskas apie furą, kas nėra paros kaštai.
--
-- Visi stulpeliai neprivalomi (`null` = nežinoma). Programa juos siunčia tik
-- tada, kai jie užpildyti, todėl iki šios migracijos furas vis tiek galima
-- įrašyti – tik be kortelės duomenų.
--
-- Apribojimai tie patys kaip formos patikroje (`lib/truck-profile.ts`): jei kas
-- nors įrašytų tiesiai į duomenų bazę, neįtikėtina reikšmė vis tiek nepraeis.

alter table public.trucks
  add column if not exists make text
    check (make is null or length(make) <= 60),
  add column if not exists model text
    check (model is null or length(model) <= 60),
  add column if not exists manufacture_year integer
    check (manufacture_year is null or manufacture_year between 1980 and 2100),
  -- VIN be I, O ir Q – standartas jų nenaudoja, kad nebūtų painiojami su 1 ir 0.
  add column if not exists vin text
    check (vin is null or vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  add column if not exists trailer_plate text
    check (trailer_plate is null or length(trailer_plate) <= 20),

  -- EURO klasė ir ašys lemia kelių mokesčius, todėl tik iš sąrašo.
  add column if not exists euro_class text
    check (euro_class is null or euro_class in (
      'EURO_3', 'EURO_4', 'EURO_5', 'EEV', 'EURO_6', 'EURO_7', 'ZERO_EMISSION'
    )),
  add column if not exists axles integer
    check (axles is null or axles between 2 and 10),
  add column if not exists fuel_type text
    check (fuel_type is null or fuel_type in (
      'DIESEL', 'HVO', 'LNG', 'CNG', 'ELECTRIC', 'HYDROGEN'
    )),

  -- Atsarginės normos, kai telematika apie furą nieko nežino.
  add column if not exists fuel_norm_l_per_100km numeric(6, 2)
    check (fuel_norm_l_per_100km is null or fuel_norm_l_per_100km between 0 and 100),
  add column if not exists adblue_norm_l_per_100km numeric(6, 2)
    check (adblue_norm_l_per_100km is null or adblue_norm_l_per_100km between 0 and 20),

  add column if not exists inspection_valid_until date,
  add column if not exists insurance_valid_until date,
  add column if not exists tachograph_calibration_until date,

  add column if not exists notes text
    check (notes is null or length(notes) <= 1000);

comment on column public.trucks.euro_class is
  'EURO emisijų klasė. Nuo jos priklauso kelių mokesčiai. Tuščia – nežinoma.';

comment on column public.trucks.axles is
  'Ašių skaičius kartu su priekaba. Nuo jo priklauso kelių mokesčiai.';

comment on column public.trucks.fuel_norm_l_per_100km is
  'Kuro norma, kai telematika apie furą nieko nežino. Tuščia – nenurodyta.';
