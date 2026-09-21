import { getSupabaseClient } from "./supabase";
import { calculateSavedTrip } from "./trip-input";
import type { CountryTariff } from "./calc";
import type { TripCountryLegInsert, TripInsert, TripWithLegs } from "../types/trip";
import type { Trip, TripCountryLeg } from "../types/trip";
import type { Truck } from "../types/truck";

export interface TripSummary {
  id: string;
  tripNumber: string;
  origin: string;
  destination: string;
  tripDate: string;
  truckPlate: string;
  paidKm: number;
  revenueCents: number;
  totalCostCents: number;
  profitCents: number;
  marginPercent: number | null;
  profitPerKm: number | null;
}

export function buildTripSummaries(
  trips: Trip[],
  legs: TripCountryLeg[],
  trucks: Truck[],
  tariffs: CountryTariff[],
): TripSummary[] {
  const trucksById = new Map(trucks.map((truck) => [truck.id, truck]));
  const legsByTrip = new Map<string, TripCountryLeg[]>();

  for (const leg of legs) {
    const tripLegs = legsByTrip.get(leg.trip_id) ?? [];
    tripLegs.push(leg);
    legsByTrip.set(leg.trip_id, tripLegs);
  }

  // Kaštai imami iš reiso kopijos, fura reikalinga tik numeriui. Reisas be
  // furos praleidžiamas, o ne meta klaidą: viena ištrinta fura neturi
  // nuversti viso sąrašo ir suvestinės.
  return trips.flatMap((trip) => {
    const truck = trucksById.get(trip.truck_id);
    if (!truck) {
      return [];
    }

    const result = calculateSavedTrip(
      trip,
      (legsByTrip.get(trip.id) ?? []).map(({ country, km }) => ({ country, km })),
      trip.truck_costs,
      tariffs,
    );

    return [{
      id: trip.id,
      tripNumber: trip.trip_number,
      origin: trip.origin,
      destination: trip.destination,
      tripDate: trip.trip_date,
      truckPlate: truck.plate,
      paidKm: trip.paid_km,
      revenueCents: result.revenueCents,
      totalCostCents: result.totalCostCents,
      profitCents: result.profitCents,
      marginPercent: result.marginPercent,
      profitPerKm: result.profitPerKm,
    }];
  });
}

/** Uses a database transaction so failed legs cannot leave a partial trip. */
export async function saveTrip(trip: TripInsert, legs: TripCountryLegInsert[]): Promise<TripWithLegs> {
  const { data, error } = await getSupabaseClient().rpc("save_trip_with_legs", {
    trip_data: trip, legs_data: legs,
  });
  if (error) throw error;
  if (!data?.id || !Array.isArray(data.legs)) throw new Error("Invalid saved trip response.");
  return data as TripWithLegs;
}

export async function listTrips(): Promise<TripSummary[]> {
  const client = getSupabaseClient();
  const [tripsResult, legsResult, trucksResult, tariffsResult] = await Promise.all([
    client.from("trips").select("*").order("trip_date", { ascending: false }).order("created_at", { ascending: false }),
    client.from("trip_country_legs").select("*"),
    client.from("trucks").select("*"),
    client.from("country_tariffs").select("country,rate,rate_type"),
  ]);

  const error = tripsResult.error ?? legsResult.error ?? trucksResult.error ?? tariffsResult.error;
  if (error) throw error;

  const tariffs: CountryTariff[] = (tariffsResult.data ?? []).map((tariff) => ({
    country: tariff.country,
    rate: Number(tariff.rate),
    rateType: tariff.rate_type,
  }));

  return buildTripSummaries(
    (tripsResult.data ?? []) as Trip[],
    (legsResult.data ?? []) as TripCountryLeg[],
    (trucksResult.data ?? []) as Truck[],
    tariffs,
  );
}
