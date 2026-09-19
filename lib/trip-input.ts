import { calcTrip, type CountryTariff } from "./calc";
import type { Truck } from "../types/truck";
import type { TripInsert, TripCountryLegInsert } from "../types/trip";

export function calculateSavedTrip(trip: TripInsert, legs: TripCountryLegInsert[], truck: Truck, tariffs: CountryTariff[]) {
  return calcTrip({
    truck: { dailyCents: {
      depreciation: truck.depreciation_cents, interest: truck.interest_cents,
      insuranceKasko: truck.insurance_kasko_cents, insuranceCivil: truck.insurance_civil_cents,
      insuranceCmr: truck.insurance_cmr_cents, driverSalary: truck.driver_salary_cents,
      perDiem: truck.per_diem_cents, repairs: truck.repairs_cents, management: truck.management_cents,
    }, trailerMonthlyCents: truck.trailer_monthly_cents, workingDaysPerMonth: truck.working_days_per_month },
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
