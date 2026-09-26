import { describe, expect, it } from "vitest";

import { calculateDashboardStats } from "./dashboard";
import { change, comparePeriod } from "./period-compare";
import { previousPeriodRange } from "./trip-period";
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

const TODAY = "2026-09-24";

describe("previousPeriodRange", () => {
  it("prieš šį mėnesį eina praėjęs", () => {
    expect(previousPeriodRange("month", TODAY)).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });

  it("prieš praėjusį mėnesį eina užpraeitas", () => {
    expect(previousPeriodRange("previousMonth", TODAY)).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });

  it("persiverčia per metų ribą", () => {
    // Vasario užpraeitas mėnuo yra praėjusių metų gruodis.
    expect(previousPeriodRange("previousMonth", "2026-02-10")).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });

  it("prieš šiuos metus eina praėję", () => {
    expect(previousPeriodRange("year", TODAY)).toEqual({
      from: "2025-01-01",
      to: "2025-12-31",
    });
  });

  it("prieš „visus“ nieko nėra", () => {
    expect(previousPeriodRange("all", TODAY)).toBeNull();
  });
});

describe("change", () => {
  it("skaičiuoja augimą", () => {
    expect(change(120, 100)).toEqual({ percent: 20, difference: 20 });
  });

  it("nuostolio mažėjimą laiko pagerėjimu", () => {
    // Nuo −1 000 iki −500 yra 50 % geriau, o ne blogiau.
    expect(change(-500, -1000).percent).toBe(50);
  });

  it("nuo nulio procento nerodo", () => {
    // Bet koks skaičius nuo nulio būtų begalybė, o ne „+100 %“.
    expect(change(500, 0)).toEqual({ percent: null, difference: 500 });
  });
});

describe("comparePeriod", () => {
  const trips = [
    trip({ id: "1", tripDate: "2026-09-10", revenueCents: 300000, profitCents: 60000 }),
    trip({ id: "2", tripDate: "2026-08-10", revenueCents: 200000, profitCents: 40000 }),
    trip({ id: "3", tripDate: "2026-08-20", revenueCents: 100000, profitCents: 10000 }),
  ];

  const currentStats = (from: string, to: string) =>
    calculateDashboardStats(trips.filter((t) => t.tripDate >= from && t.tripDate <= to));

  it("lygina su praėjusiu mėnesiu", () => {
    const comparison = comparePeriod(
      trips,
      "month",
      TODAY,
      currentStats("2026-09-01", "2026-09-30"),
    );

    expect(comparison?.previous.revenueCents).toBe(300000);
    expect(comparison?.profit.difference).toBe(10000);
    expect(comparison?.tripCount.difference).toBe(-1);
  });

  it("maržą lygina punktais", () => {
    const comparison = comparePeriod(
      trips,
      "month",
      TODAY,
      currentStats("2026-09-01", "2026-09-30"),
    );

    // Rugsėjis 20 %, rugpjūtis 50 000 / 300 000 = 16,67 %.
    expect(comparison?.marginPoints).toBeCloseTo(20 - (50000 / 300000) * 100, 6);
  });

  it("tuščio praėjusio laikotarpio nelaiko nuliu", () => {
    // Kitaip pirmas veiklos mėnuo rodytų sugalvotą „+100 %“.
    const vienas = [trip({ id: "1", tripDate: "2026-09-10" })];
    expect(comparePeriod(vienas, "month", TODAY, calculateDashboardStats(vienas))).toBeNull();
  });

  it("„visiems“ palyginimo nėra", () => {
    expect(comparePeriod(trips, "all", TODAY, calculateDashboardStats(trips))).toBeNull();
  });
});
