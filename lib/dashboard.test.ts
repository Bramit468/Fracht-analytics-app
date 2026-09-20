import { expect, it } from "vitest";
import { calculateDashboardStats } from "./dashboard";
import type { TripSummary } from "./trips";

const trips: TripSummary[] = [
  {
    id: "trip-1",
    tripNumber: "LT001",
    origin: "Vilnius",
    destination: "Hamburg",
    tripDate: "2026-09-20",
    truckPlate: "NNN 888",
    revenueCents: 240000,
    totalCostCents: 152900,
    profitCents: 87100,
    marginPercent: 36.3,
    profitPerKm: 0.5,
  },
  {
    id: "trip-2",
    tripNumber: "LT002",
    origin: "Kaunas",
    destination: "Rotterdam",
    tripDate: "2026-09-21",
    truckPlate: "NNN 888",
    revenueCents: 100000,
    totalCostCents: 110000,
    profitCents: -10000,
    marginPercent: -10,
    profitPerKm: -0.1,
  },
];

it("calculates dashboard totals and averages", () => {
  const stats = calculateDashboardStats(trips);

  expect(stats).toMatchObject({
    tripCount: 2,
    revenueCents: 340000,
    totalCostCents: 262900,
    profitCents: 77100,
  });
  expect(stats.averageMarginPercent).toBeCloseTo(13.15);
  expect(stats.averageProfitPerKm).toBeCloseTo(0.2);
});

it("returns zero totals and unavailable averages without trips", () => {
  expect(calculateDashboardStats([])).toEqual({
    tripCount: 0,
    revenueCents: 0,
    totalCostCents: 0,
    profitCents: 0,
    averageMarginPercent: null,
    averageProfitPerKm: null,
  });
});

it("excludes unavailable trip ratios from averages", () => {
  const stats = calculateDashboardStats([
    ...trips,
    { ...trips[0], id: "trip-3", marginPercent: null, profitPerKm: null },
  ]);

  expect(stats.tripCount).toBe(3);
  expect(stats.averageMarginPercent).toBeCloseTo(13.15);
  expect(stats.averageProfitPerKm).toBeCloseTo(0.2);
});
