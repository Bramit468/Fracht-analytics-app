import { getSupabaseClient } from "./supabase";
import type { TripCountryLegInsert, TripInsert, TripWithLegs } from "../types/trip";

/** Uses a database transaction so failed legs cannot leave a partial trip. */
export async function saveTrip(trip: TripInsert, legs: TripCountryLegInsert[]): Promise<TripWithLegs> {
  const { data, error } = await getSupabaseClient().rpc("save_trip_with_legs", {
    trip_data: trip, legs_data: legs,
  });
  if (error) throw error;
  if (!data?.id || !Array.isArray(data.legs)) throw new Error("Invalid saved trip response.");
  return data as TripWithLegs;
}
