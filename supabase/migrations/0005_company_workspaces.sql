-- #35: isolate every customer's operational data by company.
--
-- Existing data and existing Auth users are attached to one initial workspace.
-- Every later Auth user gets a separate workspace automatically. Joining an
-- existing company will be handled by the invitation flow in a later issue.

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.company_members (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id),
  constraint company_members_one_company_per_user unique (user_id)
);

alter table public.trucks add column if not exists company_id uuid;
alter table public.trips add column if not exists company_id uuid;

do $$
declare
  initial_company_id uuid;
begin
  select id into initial_company_id
  from public.companies
  order by created_at, id
  limit 1;

  if initial_company_id is null then
    insert into public.companies (name)
    values ('Fracht Analytics')
    returning id into initial_company_id;
  end if;

  insert into public.company_members (company_id, user_id, role)
  select initial_company_id, id, 'owner'
  from auth.users
  on conflict (user_id) do nothing;

  update public.trucks
  set company_id = initial_company_id
  where company_id is null;

  update public.trips
  set company_id = initial_company_id
  where company_id is null;
end;
$$;

create or replace function public.current_user_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id
  from public.company_members
  where user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.current_user_company_id() from public;
grant execute on function public.current_user_company_id() to authenticated;

alter table public.trucks
  alter column company_id set default public.current_user_company_id(),
  alter column company_id set not null;

alter table public.trips
  alter column company_id set default public.current_user_company_id(),
  alter column company_id set not null;

alter table public.trucks
  add constraint trucks_company_id_fkey
  foreign key (company_id) references public.companies (id) on delete restrict;

alter table public.trips
  add constraint trips_company_id_fkey
  foreign key (company_id) references public.companies (id) on delete restrict;

alter table public.trucks drop constraint if exists trucks_plate_key;
create unique index if not exists trucks_company_plate_key
  on public.trucks (company_id, plate);

create unique index if not exists trucks_company_id_id_key
  on public.trucks (company_id, id);

alter table public.trips
  add constraint trips_company_truck_fkey
  foreign key (company_id, truck_id)
  references public.trucks (company_id, id)
  on delete restrict;

create index if not exists company_members_user_id_idx
  on public.company_members (user_id);

create index if not exists trips_company_date_idx
  on public.trips (company_id, trip_date desc);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_company_id uuid;
  company_label text;
begin
  if not exists (select 1 from public.company_members) then
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

  insert into public.company_members (company_id, user_id, role)
  values (assigned_company_id, new.id, 'owner')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public;

drop trigger if exists on_auth_user_created_create_company on auth.users;
create trigger on_auth_user_created_create_company
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

alter table public.companies enable row level security;
alter table public.company_members enable row level security;

drop policy if exists trucks_temporary_open_access on public.trucks;
drop policy if exists country_tariffs_temporary_open_access on public.country_tariffs;
drop policy if exists trips_temporary_open_access on public.trips;
drop policy if exists trip_country_legs_temporary_open_access on public.trip_country_legs;

create policy companies_select_own on public.companies
  for select to authenticated
  using (id = public.current_user_company_id());

create policy company_members_select_own on public.company_members
  for select to authenticated
  using (company_id = public.current_user_company_id());

create policy trucks_company_access on public.trucks
  for all to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());

create policy trips_company_access on public.trips
  for all to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());

create policy trip_country_legs_company_access on public.trip_country_legs
  for all to authenticated
  using (
    exists (
      select 1 from public.trips
      where trips.id = trip_country_legs.trip_id
        and trips.company_id = public.current_user_company_id()
    )
  )
  with check (
    exists (
      select 1 from public.trips
      where trips.id = trip_country_legs.trip_id
        and trips.company_id = public.current_user_company_id()
    )
  );

create policy country_tariffs_authenticated_read on public.country_tariffs
  for select to authenticated
  using (true);

grant select on public.companies, public.company_members, public.country_tariffs to authenticated;
grant select, insert, update, delete on public.trucks, public.trips, public.trip_country_legs to authenticated;

revoke execute on function public.save_trip_with_legs(jsonb, jsonb) from anon;
grant execute on function public.save_trip_with_legs(jsonb, jsonb) to authenticated;

comment on table public.companies is
  'Klientų darbo erdvės. Kiekviena įmonė mato tik savo operacinius duomenis.';

comment on table public.company_members is
  'Supabase Auth naudotojų narystė įmonės darbo erdvėje.';
