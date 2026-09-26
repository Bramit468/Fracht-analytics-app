import { describe, expect, it } from "vitest";

import { median, routeHistory } from "./route-history";
import type { TripSummary } from "./trips";

function trip(overrides: Partial<TripSummary>): TripSummary {
  return {
    id: "1",
    tripNumber: "R-001",
    origin: "Panevėžys",
    destination: "Oslas",
    tripDate: "2026-09-10",
    truckPlate: "LOV 141",
    paidKm: 1000,
    emptyKm: 0,
    emptyFuelCents: 0,
    revenueCents: 200000,
    totalCostCents: 150000,
    profitCents: 50000,
    marginPercent: 25,
    profitPerKm: 0.5,
    roadByCountry: [],
    ...overrides,
  };
}

describe("median", () => {
  it("nelyginiam kiekiui grąžina vidurinę", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("lyginiam kiekiui – dviejų vidurinių vidurkį", () => {
    expect(median([1, 3, 5, 7])).toBe(4);
  });

  it("tuščio sąrašo medianos nėra", () => {
    expect(median([])).toBeNull();
  });
});

describe("routeHistory", () => {
  const trips = [
    trip({ id: "1", revenueCents: 180000, tripDate: "2026-07-01" }),
    trip({ id: "2", revenueCents: 200000, tripDate: "2026-08-01" }),
    trip({ id: "3", revenueCents: 260000, tripDate: "2026-09-01" }),
    trip({ id: "4", origin: "Kaunas", destination: "Hamburgas", revenueCents: 90000 }),
  ];

  it("randa tą pačią kryptį", () => {
    const history = routeHistory(trips, "Panevėžys", "Oslas");
    expect(history).toMatchObject({ matchType: "route", tripCount: 3 });
  });

  it("skaičiuoja medianą, o ne vidurkį", () => {
    // Vidurkis būtų 2 133 €, mediana – 2 000 €: vienas brangus reisas nemeluoja.
    expect(routeHistory(trips, "Panevėžys", "Oslas")?.medianRevenueCents).toBe(200000);
  });

  it("rodo kainų ribas ir paskutinį kartą", () => {
    const history = routeHistory(trips, "Panevėžys", "Oslas");
    expect(history).toMatchObject({
      lowestRevenueCents: 180000,
      highestRevenueCents: 260000,
      lastTripDate: "2026-09-01",
    });
  });

  it("nepaiso rašybos skirtumų", () => {
    expect(routeHistory(trips, "panevezys", "OSLAS")?.tripCount).toBe(3);
  });

  it("neradus krypties griebiasi tos pačios atvykimo vietos", () => {
    // Iš Kauno į Oslą dar nevažiuota, bet kitų reisų į Oslą kaina – atskaitos taškas.
    const history = routeHistory(trips, "Kaunas", "Oslas");
    expect(history).toMatchObject({ matchType: "destination", tripCount: 3 });
  });

  it("nieko panašaus neradus grąžina null", () => {
    expect(routeHistory(trips, "Vilnius", "Madridas")).toBeNull();
  });

  it("be atvykimo vietos nieko nesiūlo", () => {
    expect(routeHistory(trips, "Panevėžys", "  ")).toBeNull();
  });

  it("taisomo reiso į savo istoriją neįskaičiuoja", () => {
    // Kitaip reisas pats sau būtų pavyzdys, ir kaina niekada nepasikeistų.
    const history = routeHistory(trips, "Panevėžys", "Oslas", "3");
    expect(history).toMatchObject({ tripCount: 2, highestRevenueCents: 200000 });
  });

  it("reisų be km neįtraukia į kainą už km", () => {
    const beKm = [
      trip({ id: "1", paidKm: 0, revenueCents: 300000 }),
      trip({ id: "2", paidKm: 1000, revenueCents: 200000 }),
    ];

    expect(routeHistory(beKm, "Panevėžys", "Oslas")?.medianPricePerKm).toBeCloseTo(2, 6);
  });

  it("kai km nėra visai, kainos už km nerodo", () => {
    const beKm = [trip({ id: "1", paidKm: 0 })];
    expect(routeHistory(beKm, "Panevėžys", "Oslas")?.medianPricePerKm).toBeNull();
  });
});
