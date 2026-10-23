import { expect, it } from "vitest";
import { calculateDashboardStats, splitUnrealistic, utilizationPercent } from "./dashboard";
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
    days: 1,
    emptyKm: 0,
    emptyFuelCents: 0,
    revenueCents: 240000,
    totalCostCents: 152900,
    profitCents: 87100,
    marginPercent: 36.3,
    profitPerKm: 0.5,
    profitPerDayCents: null,
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
    days: 1,
    emptyKm: 0,
    emptyFuelCents: 0,
    revenueCents: 100000,
    totalCostCents: 110000,
    profitCents: -10000,
    marginPercent: -10,
    profitPerKm: -0.1,
    profitPerDayCents: null,
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
    costPerKm: null,
    profitPerDayCents: null,
    days: 0,
    paidKm: 0,
    emptyKm: 0,
    revenuePerDayCents: null,
    costPerDayCents: null,
    revenuePerKm: null,
    emptySharePercent: null,
  });
});

it("pelnas per parą – visas pelnas / visos paros, ne reisų vidurkis", () => {
  // 87 100 ct per 2 paras ir −10 000 ct per 3 paras: 77 100 / 5 = 15 420 ct.
  const stats = calculateDashboardStats([
    { ...trips[0], days: 2 },
    { ...trips[1], days: 3 },
  ]);
  expect(stats.profitPerDayCents).toBe(15420);
});

it("savikaina už km skaičiuojama nuo apmokamų km", () => {
  // 262 900 ct kaštų / 2740 apmokamų km = 0,9595 €/km. Tušti km čia neįeina:
  // pajamos gaunamos tik už apmokamus, tad su jais kaina ir lyginama.
  const stats = calculateDashboardStats(trips);
  expect(stats.costPerKm).toBeCloseTo(262900 / 100 / 2740, 6);
});

it("nuostolingas reisas mažina bendrą maržą", () => {
  const stats = calculateDashboardStats([trips[1]]);

  expect(stats.marginPercent).toBeCloseTo(-10);
  expect(stats.profitPerKm).toBeCloseTo(-0.1);
});

it("skaičiuoja paros ir km rodiklius iš bendrų sumų", () => {
  const stats = calculateDashboardStats(trips);
  // 2 paros, 3400 € pajamų, 2629 € kaštų, 2740 km.
  expect(stats.days).toBe(2);
  expect(stats.revenuePerDayCents).toBe(170000);
  expect(stats.costPerDayCents).toBe(131450);
  expect(stats.revenuePerKm).toBeCloseTo(3400 / 2740, 6);
  expect(stats.emptySharePercent).toBe(0);
});

it("be parų ir km per parą ir per km rodiklių nėra", () => {
  const stats = calculateDashboardStats([]);
  expect(stats.revenuePerDayCents).toBeNull();
  expect(stats.revenuePerKm).toBeNull();
  expect(stats.emptySharePercent).toBeNull();
});

it("atskiria nerealius reisus: pajamos < 200 €", () => {
  const cheap = { ...trips[0], id: "cheap", revenueCents: 7000 };
  const { realistic, unrealistic } = splitUnrealistic([...trips, cheap]);
  expect(realistic.map((trip) => trip.id)).toEqual(["trip-1", "trip-2"]);
  expect(unrealistic.map((trip) => trip.id)).toEqual(["cheap"]);
});

it("užimtumas skaičiuojamas iki šiandien, ne iki mėnesio galo", () => {
  // 2 furos × 10 dienų (spalio 1–10) = 20 parų, dirbta 15.
  expect(utilizationPercent(15, 2, "2026-10-01", "2026-10-31", "2026-10-10")).toBe(75);
  expect(utilizationPercent(15, 0, "2026-10-01", "2026-10-31", "2026-10-10")).toBeNull();
});
