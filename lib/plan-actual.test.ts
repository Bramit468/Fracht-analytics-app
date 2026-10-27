import { describe, expect, it } from "vitest";
import { actualsOverSpans, isCovered, planVsActual, telematicsCoverage, tripSpan } from "./plan-actual";
import type { DailyDistance, Supply } from "./telematics-costs";
import type { TripSummary } from "./trips";

const day = (date: string, km: number, fuelL: number | null = km * 0.3, plate = "LOV141"): DailyDistance => ({ plate, date, km, fuelL });
const supply = (date: string, kind: Supply["kind"], costCents: number, plate = "LOV 141"): Supply => ({ plate, date, kind, costCents, quantity: null, country: null });

function trip(tripDate: string, days: number, costs: { fuel: number; adblue: number; roads: number }, truckPlate = "LOV 141", fuelLitres?: number): TripSummary {
  return { truckPlate, tripDate, days, paidKm: 900, emptyKm: 100, fuelLitres, costs: { drivers: 0, perDiem: 0, truck: 0, repairs: 0, management: 0, trailer: 0, ...costs } } as TripSummary;
}

describe("tripSpan", () => {
  it("counts a fractional last day as a day", () => {
    expect(tripSpan(trip("2026-09-29", 2.375, { fuel: 0, adblue: 0, roads: 0 }))).toEqual({ plate: "LOV 141", from: "2026-09-29", to: "2026-10-01" });
    expect(tripSpan(trip("2026-09-29", 1, { fuel: 0, adblue: 0, roads: 0 })).to).toBe("2026-09-29");
  });
});

describe("actualsOverSpans", () => {
  it("counts overlapping trip days once, skips days without trips, matches plates without spaces", () => {
    const daily = [day("2026-10-01", 500), day("2026-10-02", 400), day("2026-10-03", 300), day("2026-10-04", 999, null)];
    const supplies = [supply("2026-10-02", "diesel", 50_000), supply("2026-10-03", "toll", 7_000), supply("2026-10-04", "diesel", 99_000), supply("2026-10-02", "other", 1_000)];
    const spans = [{ plate: "LOV 141", from: "2026-10-01", to: "2026-10-02" }, { plate: "LOV 141", from: "2026-10-02", to: "2026-10-03" }];
    expect(actualsOverSpans(daily, supplies, spans)).toEqual([{
      plate: "LOV141", km: 1200, fuelL: 360, fuelKm: 1200, fuelCents: 50_000, adblueCents: 0, roadCents: 7_000,
    }]);
  });
});

describe("coverage", () => {
  it("compares only trips fully inside the telematics days", () => {
    const coverage = telematicsCoverage([day("2026-08-01", 1), day("2026-10-22", 1), day("2026-09-01", 1)])!;
    expect(coverage).toEqual({ from: "2026-08-01", to: "2026-10-22" });
    expect(isCovered({ plate: "X", from: "2026-08-01", to: "2026-08-03" }, coverage)).toBe(true);
    expect(isCovered({ plate: "X", from: "2026-07-31", to: "2026-08-02" }, coverage)).toBe(false);
    expect(isCovered({ plate: "X", from: "2026-10-21", to: "2026-10-23" }, coverage)).toBe(false);
    expect(isCovered({ plate: "X", from: "2026-08-01", to: "2026-10-20" }, coverage)).toBe(false);
    expect(telematicsCoverage([])).toBeNull();
  });
});

describe("planVsActual", () => {
  it("sums plan per truck, puts the worst truck first, lists trucks without data apart", () => {
    const trips = [
      trip("2026-10-01", 2, { fuel: 40_000, adblue: 1_000, roads: 5_000 }, "LOV 141", 280),
      trip("2026-10-05", 1, { fuel: 10_000, adblue: 0, roads: 0 }, "LOV 141", 300),
      trip("2026-10-01", 1, { fuel: 20_000, adblue: 0, roads: 0 }, "NNN 888"),
      trip("2026-10-01", 1, { fuel: 20_000, adblue: 0, roads: 0 }, "XXX 000"),
    ];
    const actuals = [
      { plate: "LOV141", km: 2100, fuelL: 600, fuelKm: 2000, fuelCents: 60_000, adblueCents: 1_000, roadCents: 4_000 },
      { plate: "NNN 888", km: 900, fuelL: 0, fuelKm: 0, fuelCents: 15_000, adblueCents: 0, roadCents: 0 },
    ];
    const { rows, total, missing } = planVsActual(trips, actuals);
    expect(rows.map((row) => [row.plate, row.tripCount, row.diffCents])).toEqual([["LOV 141", 2, 9_000], ["NNN 888", 1, -5_000]]);
    expect(rows[0].plannedKm).toBe(2000);
    expect(rows[0].actualLitresPer100Km).toBe(30);
    expect(rows[1].actualLitresPer100Km).toBeNull();
    expect(rows[0].plannedLitresPer100Km).toBeCloseTo(29);
    expect(rows[1].plannedLitresPer100Km).toBeNull();
    expect(total.plannedLitresPer100Km).toBeCloseTo(29);
    expect(total.diffCents).toBe(4_000);
    expect(total.tripCount).toBe(3);
    expect(missing).toEqual(["XXX 000"]);
  });
});
