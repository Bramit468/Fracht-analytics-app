import { describe, expect, it } from "vitest";
import { calcTrip, type Truck } from "./calc";
import { costStructure, tripCostBreakdown } from "./cost-structure";
import type { TripSummary } from "./trips";

const truck: Truck = {
  dailyCents: {
    depreciation: 5700, interest: 300, insuranceKasko: 400, insuranceCivil: 800, insuranceCmr: 200,
    driverSalary: 14500, perDiem: 6000, repairs: 2800, management: 1500,
  },
  trailerMonthlyCents: 100_000,
  workingDaysPerMonth: 365 / 12,
};

function run(days: number, perDiemCents: number | null = null) {
  return calcTrip({
    truck, days, paidKm: 1750, emptyKm: 120,
    fuel: { litresPer100Km: 29.5, pricePerLitre: 1.42 },
    adblue: { litresPer100Km: 1.2, pricePerLitre: 0.6 },
    extras: { bridgesCents: 0, ferriesCents: 12_000, tunnelsCents: 0, parkingCents: 500 },
    legs: [{ country: "PL", km: 600 }, { country: "DE", km: 900 }],
    tariffs: [{ country: "PL", rate: 0.2, rateType: "per_km" }, { country: "DE", rate: 0.35, rateType: "per_km" }],
    revenue: { mode: "freight", freightPriceCents: 300_000 },
    perDiemCents,
  });
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("tripCostBreakdown", () => {
  it.each([
    ["whole days, fixed per diem", 4, null],
    ["fractional imported days", 2.375, null],
    ["per diem by country replaces the fixed one", 3, 21_000],
  ])("sums exactly to the trip total: %s", (_, days, perDiem) => {
    const result = run(days, perDiem);
    const costs = tripCostBreakdown(truck, days, result);
    expect(sum(Object.values(costs))).toBeCloseTo(result.totalCostCents, 6);
    expect(costs.perDiem).toBe(result.perDiemCents);
  });
});

describe("costStructure", () => {
  it("adds trips, sorts by size, and gives per-day and share", () => {
    const trips = [run(4), run(2)].map((result, i) => ({
      days: i ? 2 : 4,
      totalCostCents: result.totalCostCents,
      costs: tripCostBreakdown(truck, i ? 2 : 4, result),
    })) as TripSummary[];
    const rows = costStructure(trips);
    expect(rows[0].key).toBe("fuel");
    expect(sum(rows.map((row) => row.cents))).toBeCloseTo(trips[0].totalCostCents + trips[1].totalCostCents, 6);
    expect(sum(rows.map((row) => row.sharePercent ?? 0))).toBeCloseTo(100, 6);
    expect(rows.find((row) => row.key === "drivers")?.perDayCents).toBe(14500);
  });

  it("has no shares or per-day values without costs or days", () => {
    expect(costStructure([])).toEqual([]);
  });
});
