-- #97: pakvietimas į esamą įmonę.
--
-- `0005` kiekvienam naujam Auth naudotojui sukuria atskirą įmonę ir palieka
-- pastabą, kad pakvietimai bus vėliau. Dėl to antras darbuotojas pamato tuščią
-- programą, o sujungti dvi erdves galima tik ranka per SQL — taip ir buvo
-- daryta.
--
-- Čia pakvietimas suvedamas iš anksto: savininkas įrašo el. paštą, ir kai tuo
-- adresu kas nors užsiregistruoja, jis patenka į tą pačią įmonę.
--
-- Nuorodų su slaptu raktu sąmoningai nenaudojame: nuorodą galima persiųsti, o
-- el. paštas jau yra tapatybė, kurią patikrina Supabase Auth.

create table if not exists public.company_invitations (
  company_id uuid not null default public.current_user_company_id()
    references public.companies (id) on delete cascade,
  -- Tik mažosiomis: Auth el. paštą laiko taip pat, todėl „Jonas@“ ir „jonas@“
  -- turi būti tas pats pakvietimas.
  email text not null check (email = lower(email) and position('@' in email) > 1),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (company_id, email)
);

comment on table public.company_invitations is
  'Laukiantys pakvietimai. Užsiregistravus tuo el. paštu, naudotojas patenka į įmonę.';

-- Tas pats adresas negali laukti dviejose įmonėse: kitaip nebūtų aišku, į
-- kurią jį dėti, ir rezultatas priklausytų nuo eilučių tvarkos.
create unique index if not exists company_invitations_pending_email_key
  on public.company_invitations (email)
  where accepted_at is null;

alter table public.company_invitations enable row level security;

drop policy if exists company_invitations_company_access on public.company_invitations;
create policy company_invitations_company_access on public.company_invitations
  for all to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());

grant select, insert, update, delete on public.company_invitations to authenticated;

/*
 * Registracija: pirma žiūrima, ar naujo naudotojo laukia pakvietimas.
 *
 * Be pakvietimo viskas lieka kaip buvo: pirmas naudotojas patenka į esamą
 * įmonę savininku, kiti gauna savo atskirą erdvę.
 */
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_company_id uuid;
  company_label text;
  invited_email text;
  joined_by_invitation boolean := false;
begin
  invited_email := lower(trim(coalesce(new.email, '')));

  if invited_email <> '' then
    select company_id into assigned_company_id
    from public.company_invitations
    where email = invited_email and accepted_at is null;

    if assigned_company_id is not null then
      joined_by_invitation := true;

      update public.company_invitations
      set accepted_at = now()
      where company_id = assigned_company_id and email = invited_email;
    end if;
  end if;

  if assigned_company_id is null and not exists (select 1 from public.company_members) then
    select id into assigned_company_id
    from public.companies
    order by created_at, id
    limit 1;
  end if;

  if assigned_company_id is null then
    company_label := coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'company_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Nauja įmonė'
    );

    insert into public.companies (name)
    values (company_label)
    returning id into assigned_company_id;
  end if;

  -- Pakviestasis yra darbuotojas; savo erdvę susikūręs naudotojas — savininkas.
  insert into public.company_members (company_id, user_id, role)
  values (
    assigned_company_id,
    new.id,
    case when joined_by_invitation then 'member' else 'owner' end
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public;

/*
 * Kas jau turi prieigą.
 *
 * `company_members` saugo tik `user_id`, o el. paštas gyvena `auth.users`
 * lentelėje, kurios klientui atverti negalima. Todėl rodo rodinys: jis vykdomas
 * savininko teisėmis (`security_invoker = false`), bet pats apsiriboja savo
 * įmone, taip pat kaip tai daro RLS taisyklės.
 */
create or replace view public.company_member_emails
with (security_invoker = false) as
  select m.user_id, u.email::text as email, m.role, m.created_at
  from public.company_members m
  join auth.users u on u.id = m.user_id
  where m.company_id = public.current_user_company_id();

comment on view public.company_member_emails is
  'Savos įmonės nariai su el. paštais iš auth.users.';

grant select on public.company_member_emails to authenticated;
