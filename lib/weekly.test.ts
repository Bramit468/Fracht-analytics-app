import { describe, expect, it } from "vitest";
import { periodValue, WEEKLY_METRICS, weeklyTotals, weekStart } from "./weekly";
import type { TripSummary } from "./trips";

const costs = { drivers: 10_000, perDiem: 2_000, truck: 5_000, repairs: 1_000, management: 500, trailer: 500, fuel: 30_000, adblue: 500, roads: 4_000 };

function trip(tripDate: string, days: number, km: number, revenueCents: number, profitCents: number): TripSummary {
  return { tripDate, days, paidKm: km, emptyKm: 0, revenueCents, profitCents, fuelLitres: km * 0.3, costs } as TripSummary;
}

const metric = (key: string) => WEEKLY_METRICS.find((item) => item.key === key)!;

describe("weekStart", () => {
  it("returns the Monday, also across a year end", () => {
    expect(weekStart("2026-10-27")).toBe("2026-10-26");
    expect(weekStart("2026-10-26")).toBe("2026-10-26");
    expect(weekStart("2026-11-01")).toBe("2026-10-26");
    expect(weekStart("2027-01-01")).toBe("2026-12-28");
  });
});

describe("weeklyTotals", () => {
  it("keeps empty weeks, drops trips outside the range, sums by start week", () => {
    const weeks = weeklyTotals([
      trip("2026-10-27", 2, 1000, 200_000, 40_000),
      trip("2026-11-01", 1, 500, 100_000, -10_000),
      trip("2026-10-12", 1, 400, 80_000, 8_000),
      trip("2026-01-05", 1, 400, 80_000, 8_000),
    ], "2026-10-28", 3);
    expect(weeks.map((week) => [week.week, week.tripCount])).toEqual([["2026-10-12", 1], ["2026-10-19", 0], ["2026-10-26", 2]]);
    const last = weeks[2];
    expect(metric("kmPerDay").value(last)).toBe(500);
    expect(metric("profitPerDay").value(last)).toBe(100);
    expect(metric("revenuePerKm").value(last)).toBe(2);
    expect(metric("fixedPerDay").value(last)).toBeCloseTo((2 * 18_000) / 100 / 3);
    expect(metric("fuelPrice").value(last)).toBeCloseTo(600 / 450);
    expect(metric("litresPer100").value(last)).toBeCloseTo(30);
    expect(metric("kmPerDay").value(weeks[1])).toBeNull();
  });

  it("weights the period value by totals, not by weeks", () => {
    const weeks = weeklyTotals([trip("2026-10-20", 9, 4500, 900_000, 90_000), trip("2026-10-27", 1, 100, 10_000, -5_000)], "2026-10-28", 2);
    expect(periodValue(metric("profitPerDay"), weeks)).toBe(85);
  });
});
