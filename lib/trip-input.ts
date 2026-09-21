import { calcTrip, type CountryTariff, type Truck } from "./calc";
import type { TripInsert, TripCountryLegInsert } from "../types/trip";

/**
 * `truck` yra kaštų rinkinys, o ne furos eilutė: išsaugotam reisui paduodama
 * jo `truck_costs` kopija (#38), o dar neišsaugotam — dabartinė fura per
 * `truckRowToCalc`.
 */
export function calculateSavedTrip(trip: TripInsert, legs: TripCountryLegInsert[], truck: Truck, tariffs: CountryTariff[]) {
  return calcTrip({
    truck,
    days: trip.days, paidKm: trip.paid_km, emptyKm: trip.empty_km,
    fuel: { litresPer100Km: trip.fuel_l_per_100km, pricePerLitre: trip.fuel_price },
    adblue: { litresPer100Km: trip.adblue_l_per_100km, pricePerLitre: trip.adblue_price },
    extras: { bridgesCents: trip.bridges_cents, ferriesCents: trip.ferries_cents, tunnelsCents: trip.tunnels_cents, parkingCents: trip.parking_cents },
    legs, tariffs,
    revenue: trip.revenue_mode === "freight"
      ? { mode: "freight", freightPriceCents: trip.freight_price_cents! }
      : { mode: "per_km", ratePerKm: trip.rate_per_km! },
  });
}
