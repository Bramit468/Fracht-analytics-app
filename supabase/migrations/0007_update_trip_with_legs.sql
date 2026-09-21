-- #40: tas pats save_trip_with_legs ir įrašo, ir atnaujina reisą.
--
-- Atskiros funkcijos nekuriame: atkarpos ir reisas turi keistis kartu arba
-- niekaip, o tą jau daro ši funkcija. Gavusi trip_data.id ji atnaujina reisą
-- ir pakeičia jo atkarpas; be id — įrašo naują, kaip iki šiol.
--
-- Kokį reisą leidžiama liesti, sprendžia RLS (trips_company_access), todėl
-- svetimo reiso id čia nepadės.

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

  -- Kliento atsiųstas truck_costs ignoruojamas sąmoningai. Taisant reisą
  -- kopija perrašoma: taisomas reisas, vadinasi taisomi ir jo kaštai.
  costs := public.truck_cost_snapshot(input.truck_id);
  if costs is null then
    raise exception 'Unknown truck';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(legs_data) as leg(country text, km numeric)
    where not exists (select 1 from public.country_tariffs t where t.country = leg.country)
  ) then
    raise exception 'Unknown country tariff';
  end if;

  if input.id is null then
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
  else
    update public.trips set
      trip_number = input.trip_number, origin = input.origin, destination = input.destination,
      trip_date = input.trip_date, truck_id = input.truck_id, days = input.days,
      paid_km = input.paid_km, empty_km = input.empty_km,
      fuel_l_per_100km = input.fuel_l_per_100km, fuel_price = input.fuel_price,
      adblue_l_per_100km = input.adblue_l_per_100km, adblue_price = input.adblue_price,
      bridges_cents = input.bridges_cents, ferries_cents = input.ferries_cents,
      tunnels_cents = input.tunnels_cents, parking_cents = input.parking_cents,
      revenue_mode = input.revenue_mode, rate_per_km = input.rate_per_km,
      freight_price_cents = input.freight_price_cents, truck_costs = costs
    where id = input.id
    returning * into saved;

    if saved.id is null then
      raise exception 'Trip not found';
    end if;

    -- Senos atkarpos pakeičiamos naujomis, o ne pridedamos prie jų.
    delete from public.trip_country_legs where trip_id = saved.id;
  end if;

  insert into public.trip_country_legs(trip_id, country, km)
    select saved.id, leg.country, leg.km
    from jsonb_to_recordset(legs_data) as leg(country text, km numeric);
  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into saved_legs
    from public.trip_country_legs l where l.trip_id = saved.id;
  return to_jsonb(saved) || jsonb_build_object('legs', saved_legs);
end;
$$;
