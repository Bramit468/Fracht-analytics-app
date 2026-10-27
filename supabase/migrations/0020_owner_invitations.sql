-- AUDIT S3: kviesti ir atšaukti kvietimus gali tik savininkas.
--
-- 0009 politika buvo `for all` visai įmonei, o `role` niekur netikrintas, todėl
-- bet kuris darbuotojas galėjo pakviesti bet kokį el. paštą į įmonės duomenis.
-- Matyti laukiančius kvietimus gali visi nariai; rašyti – tik savininkas, kaip
-- ir įmonės nustatymus (0013).
--
-- Registracijos trigeris (`handle_new_auth_user`) yra `security definer`, todėl
-- kvietimą priimti jis gali ir toliau.
--
-- Taikoma ranka Supabase SQL redaktoriuje.

drop policy if exists company_invitations_company_access on public.company_invitations;

drop policy if exists company_invitations_select on public.company_invitations;
create policy company_invitations_select on public.company_invitations
  for select to authenticated
  using (company_id = public.current_user_company_id());

drop policy if exists company_invitations_owner_write on public.company_invitations;
create policy company_invitations_owner_write on public.company_invitations
  for all to authenticated
  using (
    company_id = public.current_user_company_id()
    and exists (
      select 1 from public.company_members m
      where m.company_id = company_invitations.company_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  )
  with check (
    company_id = public.current_user_company_id()
    and exists (
      select 1 from public.company_members m
      where m.company_id = company_invitations.company_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );
