import { expect, it } from "vitest";
import { buildTripSummaries } from "./trips";
import { truckRowToCalc } from "./truck";
import type { Trip, TripCountryLeg } from "../types/trip";
import type { Truck } from "../types/truck";

const truck: Truck = {
  id: "truck-1",
  plate: "NNN 888",
  depreciation_cents: 0,
  interest_cents: 0,
  insurance_kasko_cents: 0,
  insurance_civil_cents: 0,
  insurance_cmr_cents: 0,
  driver_salary_cents: 10000,
  per_diem_cents: 0,
  repairs_cents: 0,
  management_cents: 0,
  trailer_monthly_cents: 0,
  working_days_per_month: 22,
  empty_weight_kg: null,
  total_permitted_weight_kg: null,
};

const trip: Trip = {
  id: "trip-1",
  trip_number: "LT001",
  origin: "Vilnius",
  destination: "Hamburg",
  trip_date: "2026-09-20",
  truck_id: truck.id,
  days: 1,
  paid_km: 100,
  empty_km: 0,
  fuel_l_per_100km: 0,
  fuel_price: 0,
  adblue_l_per_100km: 0,
  adblue_price: 0,
  bridges_cents: 0,
  ferries_cents: 0,
  tunnels_cents: 0,
  parking_cents: 0,
  revenue_mode: "freight",
  rate_per_km: null,
  freight_price_cents: 25000,
  truck_costs: truckRowToCalc(truck),
  created_at: "2026-09-20T10:00:00Z",
};

const leg: TripCountryLeg = {
  id: "leg-1",
  trip_id: trip.id,
  country: "Nemokami",
  km: 100,
};

it("builds list values with the shared trip calculation", () => {
  expect(buildTripSummaries([trip], [leg], [truck], [
    { country: "Nemokami", rate: 0, rateType: "per_km" },
  ])).toEqual([{
    id: "trip-1",
    tripNumber: "LT001",
    origin: "Vilnius",
    destination: "Hamburg",
    tripDate: "2026-09-20",
    truckPlate: "NNN 888",
    paidKm: 100,
    emptyKm: 0,
    emptyFuelCents: 0,
    revenueCents: 25000,
    totalCostCents: 10000,
    profitCents: 15000,
    marginPercent: 60,
    profitPerKm: 1.5,
    roadByCountry: [{ country: "Nemokami", km: 100, costCents: 0 }],
  }]);
});

it("skaičiuoja pagal reiso kaštų kopiją, o ne pagal dabartinę furą", () => {
  // Fura pabrango dvigubai jau po reiso — senas pelnas turi likti toks pat.
  const brangesneFura: Truck = { ...truck, driver_salary_cents: 20000 };

  expect(buildTripSummaries([trip], [leg], [brangesneFura], [
    { country: "Nemokami", rate: 0, rateType: "per_km" },
  ])[0]).toMatchObject({ totalCostCents: 10000, profitCents: 15000 });
});

it("praleidžia reisą, kurio fura ištrinta, o ne nuverčia sąrašo", () => {
  expect(buildTripSummaries([trip], [leg], [], [])).toEqual([]);
});
