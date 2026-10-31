-- Saugumas: pašalinamos laikinos „atviros“ taisyklės iš 0001–0003.
--
-- 0005 jas turėjo išmesti, bet gyvoje bazėje jos liko (2026-10-31): `to public`
-- ir `using (true)`, o `anon` turi visas teises į šias lenteles. Kadangi anon
-- raktas yra naršyklėje, bet kas be prisijungimo galėjo skaityti, keisti ir
-- trinti reisus, furas, atkarpas ir tarifus.
--
-- Įmonės taisyklės (`*_company_access`, `country_tariffs_authenticated_read`)
-- lieka – aplikacija veikia per jas. Kartoti saugu.

drop policy if exists trucks_temporary_open_access on public.trucks;
drop policy if exists country_tariffs_temporary_open_access on public.country_tariffs;
drop policy if exists trips_temporary_open_access on public.trips;
drop policy if exists trip_country_legs_temporary_open_access on public.trip_country_legs;
