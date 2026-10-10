-- #181: minimali marža – įmonės riba, žemiau kurios reisas pažymimas.
--
-- Saugoma prie įmonės, ne prie naudotojo: riba yra įmonės sprendimas, ir visi
-- jos darbuotojai turi matyti tą patį įspėjimą. `null` – riba nenustatyta,
-- tada niekas ir neįspėjama.
--
-- Taikoma ranka Supabase SQL redaktoriuje. Be šios migracijos programa veikia
-- kaip anksčiau, tik ribos nustatyti negalima.

alter table public.companies
  add column if not exists min_margin_percent numeric(5, 2)
  constraint companies_min_margin_range
    check (min_margin_percent is null or (min_margin_percent >= 0 and min_margin_percent < 100));

comment on column public.companies.min_margin_percent is
  'Minimali reiso marža procentais (nuo pajamų). Žemiau jos reisas pažymimas įspėjimu.';

-- Keisti galima tik šį vieną stulpelį ir tik savo įmonės savininkui. Įmonės
-- pavadinimas ir kiti laukai lieka tik skaitomi.
grant update (min_margin_percent) on public.companies to authenticated;

drop policy if exists companies_update_own_owner on public.companies;
create policy companies_update_own_owner on public.companies
  for update to authenticated
  using (
    id = public.current_user_company_id()
    and exists (
      select 1 from public.company_members m
      where m.company_id = companies.id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  )
  with check (id = public.current_user_company_id());
