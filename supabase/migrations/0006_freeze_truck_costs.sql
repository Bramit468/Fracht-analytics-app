-- #38: reisas išsaugo tos dienos furos paros kaštus.
--
-- Iki šiol pelnas buvo skaičiuojamas imant kaštus gyvai iš trucks, todėl
-- pataisius furą būtų persiskaičiavę ir seni reisai. Dabar kaštų kopija
-- įrašoma kartu su reisu, o skaičiuojama iš jos (zr. lib/trip-input.ts).
--
-- Kopiją formuoja duomenų bazė, ne naršyklė: taip klientas negali atsiųsti
-- prasimanytų kaštų.

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
    'workingDaysPerMonth', t.working_days_per_month
  )
  from public.trucks t
  where t.id = p_truck_id;
$$;

-- revoke from public nepakanka: Supabase naujoms funkcijoms atskirai
-- suteikia teises anon rolei (taip pat kaip 0005 su save_trip_with_legs).
revoke all on function public.truck_cost_snapshot(uuid) from public, anon;
grant execute on function public.truck_cost_snapshot(uuid) to authenticated;

alter table public.trips add column if not exists truck_costs jsonb;

-- Esamiems reisams kitokios kopijos nei dabartinė fura nėra iš kur paimti.
update public.trips t
set truck_costs = public.truck_cost_snapshot(t.truck_id)
where t.truck_costs is null;

alter table public.trips alter column truck_costs set not null;

comment on column public.trips.truck_costs is
  'Furos paros kaštai reiso išsaugojimo metu. Formatas = lib/calc.ts Truck.';

create or replace function public.save_trip_with_legs(trip_data jsonb, legs_data jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  saved public.trips;
  input public.trips;
  saved_legs jsonb;
  costs jsonb;
begin
  if jsonb_typeof(legs_data) is distinct from 'array' then
    raise exception 'legs_data must be an array';
  end if;
  input := jsonb_populate_record(null::public.trips, trip_data);

  -- Kliento atsiųstas truck_costs ignoruojamas sąmoningai.
  costs := public.truck_cost_snapshot(input.truck_id);
  if costs is null then
    raise exception 'Unknown truck';
  end if;

  insert into public.trips (
    trip_number, origin, destination, trip_date, truck_id, days, paid_km, empty_km,
    fuel_l_per_100km, fuel_price, adblue_l_per_100km, adblue_price,
    bridges_cents, ferries_cents, tunnels_cents, parking_cents,
    revenue_mode, rate_per_km, freight_price_cents, truck_costs
  ) values (
    input.trip_number, input.origin, input.destination, input.trip_date, input.truck_id,
    input.days, input.paid_km, input.empty_km, input.fuel_l_per_100km, input.fuel_price,
    input.adblue_l_per_100km, input.adblue_price, input.bridges_cents, input.ferries_cents,
    input.tunnels_cents, input.parking_cents, input.revenue_mode, input.rate_per_km,
    input.freight_price_cents, costs
  ) returning * into saved;
  if exists (
    select 1 from jsonb_to_recordset(legs_data) as leg(country text, km numeric)
    where not exists (select 1 from public.country_tariffs t where t.country = leg.country)
  ) then
    raise exception 'Unknown country tariff';
  end if;
  insert into public.trip_country_legs(trip_id, country, km)
    select saved.id, leg.country, leg.km
    from jsonb_to_recordset(legs_data) as leg(country text, km numeric);
  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into saved_legs
    from public.trip_country_legs l where l.trip_id = saved.id;
  return to_jsonb(saved) || jsonb_build_object('legs', saved_legs);
end;
$$;
