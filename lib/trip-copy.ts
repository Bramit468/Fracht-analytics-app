/**
 * Reiso kopijavimas (#129).
 *
 * Tie patys maršrutai kartojasi kas savaitę: ta pati fura, tie patys km, tos
 * pačios šalių atkarpos, tas pats kuro įkainis. Vesti iš naujo reiškia dvidešimt
 * laukų ir progą suklysti viename iš jų.
 *
 * Kopijuojama viskas, **išskyrus** tai, kas kiekvienam reisui sava:
 *   - reiso numeris, nes jis turi būti naujas;
 *   - data, nes senos datos kopija tyliai priskirtų reisą ne tam mėnesiui, ir
 *     visos laikotarpio ataskaitos meluotų.
 */

import { centsToInput } from "./money";
import type { TripWithLegs } from "../types/trip";

export type TripFormDefaults = Record<string, string>;

export interface TripCopy {
  defaults: TripFormDefaults;
  legs: { country: string; km: string }[];
  revenueMode: string;
}

/** Išsaugotas reisas -> formos laukų reikšmės. Sumos verčiamos atgal į eurus. */
export function tripDefaults(trip: TripWithLegs): TripFormDefaults {
  return {
    truck_id: trip.truck_id,
    trip_number: trip.trip_number,
    origin: trip.origin,
    destination: trip.destination,
    trip_date: trip.trip_date,
    days: String(trip.days),
    paid_km: String(trip.paid_km),
    empty_km: String(trip.empty_km),
    fuel_l_per_100km: String(trip.fuel_l_per_100km),
    fuel_price: String(trip.fuel_price),
    adblue_l_per_100km: String(trip.adblue_l_per_100km),
    adblue_price: String(trip.adblue_price),
    bridges_cents: centsToInput(trip.bridges_cents),
    ferries_cents: centsToInput(trip.ferries_cents),
    tunnels_cents: centsToInput(trip.tunnels_cents),
    parking_cents: centsToInput(trip.parking_cents),
    revenue:
      trip.revenue_mode === "freight"
        ? centsToInput(trip.freight_price_cents ?? 0)
        : String(trip.rate_per_km ?? 0),
  };
}

/**
 * Kopija naujam reisui.
 *
 * Šalių atkarpos kopijuojamos: būtent jos ilgiausiai vedamos ranka ir būtent
 * jose klaida nematoma — kelių kaštai atrodo tvarkingi ir tada, kai kilometrai
 * pasiskirstę ne tarp tų šalių.
 */
export function copyForNewTrip(trip: TripWithLegs, today: string): TripCopy {
  return {
    defaults: { ...tripDefaults(trip), trip_number: "", trip_date: today },
    legs: trip.legs.map((leg) => ({ country: leg.country, km: String(leg.km) })),
    revenueMode: trip.revenue_mode,
  };
}
