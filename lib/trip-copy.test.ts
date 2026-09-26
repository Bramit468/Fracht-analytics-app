import { describe, expect, it } from "vitest";

import { copyForNewTrip, tripDefaults } from "./trip-copy";
import type { TripWithLegs } from "../types/trip";

const TRIP: TripWithLegs = {
  id: "trip-1",
  trip_number: "R-001",
  origin: "Panevėžys",
  destination: "Oslas",
  trip_date: "2026-08-10",
  truck_id: "truck-1",
  days: 4,
  paid_km: 2060,
  empty_km: 140,
  fuel_l_per_100km: 27,
  fuel_price: 1.24,
  adblue_l_per_100km: 2.4,
  adblue_price: 0.765,
  bridges_cents: 48340,
  ferries_cents: 12000,
  tunnels_cents: 0,
  parking_cents: 2500,
  revenue_mode: "freight",
  rate_per_km: null,
  freight_price_cents: 240000,
  truck_costs: {
    dailyCents: {
      depreciation: 5700,
      interest: 0,
      insuranceKasko: 400,
      insuranceCivil: 800,
      insuranceCmr: 200,
      driverSalary: 14500,
      perDiem: 0,
      repairs: 2800,
      management: 0,
    },
    trailerMonthlyCents: 55000,
    workingDaysPerMonth: 22,
  },
  created_at: "2026-08-10T08:00:00Z",
  legs: [
    { id: "leg-1", trip_id: "trip-1", country: "Lenkija", km: 600 },
    { id: "leg-2", trip_id: "trip-1", country: "Vokietija", km: 800 },
  ],
};

describe("tripDefaults", () => {
  it("sumas grąžina eurais", () => {
    expect(tripDefaults(TRIP)).toMatchObject({
      bridges_cents: "483.40",
      revenue: "2400.00",
    });
  });

  it("įkainį už km paima iš to laukelio", () => {
    const perKm = { ...TRIP, revenue_mode: "per_km" as const, rate_per_km: 1.09 };
    expect(tripDefaults(perKm).revenue).toBe("1.09");
  });
});

describe("copyForNewTrip", () => {
  const copy = copyForNewTrip(TRIP, "2026-09-26");

  it("perkelia furą, maršrutą ir kaštus", () => {
    expect(copy.defaults).toMatchObject({
      truck_id: "truck-1",
      origin: "Panevėžys",
      destination: "Oslas",
      paid_km: "2060",
      fuel_price: "1.24",
      revenue: "2400.00",
    });
  });

  it("reiso numerio nekopijuoja", () => {
    // Numeris turi būti naujas; nukopijuotas sukurtų du reisus tuo pačiu.
    expect(copy.defaults.trip_number).toBe("");
  });

  it("datą pakeičia šiandiena", () => {
    // Senos datos kopija tyliai priskirtų reisą ne tam mėnesiui, ir laikotarpio
    // ataskaitos meluotų.
    expect(copy.defaults.trip_date).toBe("2026-09-26");
  });

  it("perkelia šalių atkarpas", () => {
    expect(copy.legs).toEqual([
      { country: "Lenkija", km: "600" },
      { country: "Vokietija", km: "800" },
    ]);
  });

  it("išlaiko pajamų būdą", () => {
    expect(copy.revenueMode).toBe("freight");
  });

  it("reiso be atkarpų nesugadina", () => {
    const beAtkarpu = copyForNewTrip({ ...TRIP, legs: [] }, "2026-09-26");
    expect(beAtkarpu.legs).toEqual([]);
  });
});
