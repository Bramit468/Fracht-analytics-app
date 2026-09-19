-- #10: existing RLS applies, and a failed leg rolls back the entire call.
create or replace function public.save_trip_with_legs(trip_data jsonb, legs_data jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  saved public.trips;
  input public.trips;
  saved_legs jsonb;
begin
  if jsonb_typeof(legs_data) is distinct from 'array' then
    raise exception 'legs_data must be an array';
  end if;
  input := jsonb_populate_record(null::public.trips, trip_data);
  insert into public.trips (
    trip_number, origin, destination, trip_date, truck_id, days, paid_km, empty_km,
    fuel_l_per_100km, fuel_price, adblue_l_per_100km, adblue_price,
    bridges_cents, ferries_cents, tunnels_cents, parking_cents,
    revenue_mode, rate_per_km, freight_price_cents
  ) values (
    input.trip_number, input.origin, input.destination, input.trip_date, input.truck_id,
    input.days, input.paid_km, input.empty_km, input.fuel_l_per_100km, input.fuel_price,
    input.adblue_l_per_100km, input.adblue_price, input.bridges_cents, input.ferries_cents,
    input.tunnels_cents, input.parking_cents, input.revenue_mode, input.rate_per_km,
    input.freight_price_cents
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
