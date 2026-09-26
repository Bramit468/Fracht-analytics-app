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
    paidKm: 1740,
    emptyKm: 0,
    emptyFuelCents: 0,
    revenueCents: 240000,
    totalCostCents: 152900,
    profitCents: 87100,
    marginPercent: 36.3,
    profitPerKm: 0.5,
    roadByCountry: [],
  },
  {
    id: "trip-2",
    tripNumber: "LT002",
    origin: "Kaunas",
    destination: "Rotterdam",
    tripDate: "2026-09-21",
    truckPlate: "NNN 888",
    paidKm: 1000,
    emptyKm: 0,
    emptyFuelCents: 0,
    revenueCents: 100000,
    totalCostCents: 110000,
    profitCents: -10000,
    marginPercent: -10,
    profitPerKm: -0.1,
    roadByCountry: [],
  },
];

it("skaičiuoja bendras sumas ir santykinius rodiklius", () => {
  const stats = calculateDashboardStats(trips);

  expect(stats).toMatchObject({
    tripCount: 2,
    revenueCents: 340000,
    totalCostCents: 262900,
    profitCents: 77100,
  });
  // 77 100 / 340 000 = 22,68 %, o ne maržų vidurkis 13,15 %
  expect(stats.marginPercent).toBeCloseTo(22.676);
  expect(stats.profitPerKm).toBeCloseTo(771 / 2740);
});

it("be reisų grąžina nulius, o santykinius rodiklius – null", () => {
  expect(calculateDashboardStats([])).toEqual({
    tripCount: 0,
    revenueCents: 0,
    totalCostCents: 0,
    profitCents: 0,
    marginPercent: null,
    profitPerKm: null,
  });
});

it("nuostolingas reisas mažina bendrą maržą", () => {
  const stats = calculateDashboardStats([trips[1]]);

  expect(stats.marginPercent).toBeCloseTo(-10);
  expect(stats.profitPerKm).toBeCloseTo(-0.1);
});
