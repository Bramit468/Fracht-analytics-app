import { describe, expect, it } from "vitest";

import { monthlyStats, peakProfitCents, recentMonths, tripMonth } from "./monthly";
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

describe("tripMonth", () => {
  it("ima metus ir mėnesį", () => {
    expect(tripMonth("2026-09-10")).toBe("2026-09");
  });
});

describe("recentMonths", () => {
  it("grąžina eilę, seniausias pirmas", () => {
    expect(recentMonths("2026-09-26", 3)).toEqual(["2026-07", "2026-08", "2026-09"]);
  });

  it("persiverčia per metų ribą", () => {
    expect(recentMonths("2026-02-10", 4)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("netinkamos datos nepaverčia eilute", () => {
    expect(recentMonths("ne data", 3)).toEqual([]);
  });
});

describe("monthlyStats", () => {
  const trips = [
    trip({ id: "1", tripDate: "2026-09-10", revenueCents: 300000, totalCostCents: 240000, profitCents: 60000 }),
    trip({ id: "2", tripDate: "2026-09-20", revenueCents: 200000, totalCostCents: 150000, profitCents: 50000 }),
    trip({ id: "3", tripDate: "2026-07-05", revenueCents: 100000, totalCostCents: 120000, profitCents: -20000 }),
  ];

  it("sudeda mėnesio reisus", () => {
    const rugsejis = monthlyStats(trips, "2026-09-26", 3).at(-1);

    expect(rugsejis).toMatchObject({
      month: "2026-09",
      tripCount: 2,
      revenueCents: 500000,
      profitCents: 110000,
    });
  });

  it("mėnesį be reisų palieka eilutėje", () => {
    // Prastova yra faktas: praleista eilutė ją paslėptų.
    const rugpjutis = monthlyStats(trips, "2026-09-26", 3).find((row) => row.month === "2026-08");

    expect(rugpjutis).toMatchObject({ tripCount: 0, revenueCents: 0, profitCents: 0 });
    expect(rugpjutis?.marginPercent).toBeNull();
  });

  it("nuostolingą mėnesį rodo neigiamą", () => {
    const liepa = monthlyStats(trips, "2026-09-26", 3)[0];

    expect(liepa.profitCents).toBe(-20000);
    expect(liepa.marginPercent).toBeCloseTo(-20, 6);
  });

  it("skaičiuoja savikainą už km", () => {
    const rugsejis = monthlyStats(trips, "2026-09-26", 3).at(-1);
    expect(rugsejis?.costPerKm).toBeCloseTo(390000 / 100 / 2000, 6);
  });

  it("grąžina tiek mėnesių, kiek prašyta", () => {
    expect(monthlyStats(trips, "2026-09-26", 12)).toHaveLength(12);
  });

  it("be reisų grąžina tuščią eilę, o ne klaidą", () => {
    const months = monthlyStats([], "2026-09-26", 2);

    expect(months).toHaveLength(2);
    expect(months.every((row) => row.tripCount === 0)).toBe(true);
  });
});

describe("peakProfitCents", () => {
  it("ima didžiausią pelną arba nuostolį", () => {
    const months = monthlyStats(
      [
        trip({ id: "1", tripDate: "2026-09-10", profitCents: 40000 }),
        trip({ id: "2", tripDate: "2026-08-10", profitCents: -90000 }),
      ],
      "2026-09-26",
      3,
    );

    // Nuostolis juostelėje turi būti toks pat matomas kaip pelnas.
    expect(peakProfitCents(months)).toBe(90000);
  });

  it("be reisų grąžina nulį", () => {
    expect(peakProfitCents([])).toBe(0);
  });
});
