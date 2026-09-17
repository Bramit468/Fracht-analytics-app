import { getSupabaseClient } from "./supabase";
import type { TripCountryLegInsert, TripInsert, TripWithLegs } from "../types/trip";

/** Saves a trip and its country legs as one application operation. */
export async function saveTrip(
  trip: TripInsert,
  legs: TripCountryLegInsert[],
): Promise<TripWithLegs> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("trips").insert(trip).select().single();
  if (error) throw error;

  if (legs.length > 0) {
    const { error: legsError } = await supabase
      .from("trip_country_legs")
      .insert(legs.map((leg) => ({ ...leg, trip_id: data.id })));
    if (legsError) {
      await supabase.from("trips").delete().eq("id", data.id);
      throw legsError;
    }
  }

  return { ...data, legs: legs.map((leg) => ({ ...leg, id: "", trip_id: data.id })) } as TripWithLegs;
}
