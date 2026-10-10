-- #185: apmokėjimai – kuris užsakovas vėluoja mokėti.
--
-- Datos pildomos vėliau nei reisas (sąskaita – po iškrovimo, apmokėjimas – po
-- savaičių), todėl jos keičiamos tiesiai reisų sąraše, o ne per
-- save_trip_with_legs. Ta funkcija šių stulpelių neliečia, tad taisant reisą
-- jie neišsitrina.
--
-- Taikoma ranka Supabase SQL redaktoriuje, PO 0014.

alter table public.customers
  add column if not exists payment_terms_days integer
  constraint customers_payment_terms_range
    check (payment_terms_days is null or payment_terms_days between 0 and 365);

alter table public.trips
  add column if not exists invoiced_on date,
  add column if not exists paid_on date;

comment on column public.customers.payment_terms_days is
  'Apmokėjimo terminas dienomis nuo sąskaitos datos. null – nežinomas, tada pradelsimas neskaičiuojamas.';
comment on column public.trips.invoiced_on is 'Sąskaitos užsakovui data.';
comment on column public.trips.paid_on is 'Data, kai užsakovas sumokėjo.';
