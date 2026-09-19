import { expect, it } from "vitest";
import { calculateSavedTrip } from "./trip-input";
import type { TripInsert } from "../types/trip";
import type { Truck } from "../types/truck";
it("maps persisted units to the Omniva reference calculation", () => {
  const truck: Truck = { id: "t", plate: "NNN 888", depreciation_cents: 5700, interest_cents: 0, insurance_kasko_cents: 400, insurance_civil_cents: 800, insurance_cmr_cents: 200, driver_salary_cents: 14500, per_diem_cents: 0, repairs_cents: 2800, management_cents: 0, trailer_monthly_cents: 55000, working_days_per_month: 22 };
  const trip: TripInsert = { trip_number: "TEST", origin: "A", destination: "B", trip_date: "2026-09-19", truck_id: "t", days: 22, paid_km: 11050, empty_km: 200, fuel_l_per_100km: 26, fuel_price: 1.24, adblue_l_per_100km: 2.4, adblue_price: 0.765, bridges_cents: 36000, ferries_cents: 0, tunnels_cents: 0, parking_cents: 0, revenue_mode: "per_km", rate_per_km: 1.09, freight_price_cents: null };
  expect(calculateSavedTrip(trip, [], truck, [])).toMatchObject({ fuelCents: 362700, adblueCents: 20655, truckCents: 591800, totalCostCents: 1011155, revenueCents: 1204450, profitCents: 193295 });
  expect(calculateSavedTrip({ ...trip, revenue_mode: "freight", freight_price_cents: 1204450, rate_per_km: null }, [], truck, []).profitCents).toBe(193295);
});
