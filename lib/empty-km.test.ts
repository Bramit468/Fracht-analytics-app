import { describe, expect, it } from "vitest";

import { emptyFuelCents, emptyKmByTruck, summarizeEmptyKm } from "./empty-km";
import type { TripSummary } from "./trips";

function trip(overrides: Partial<TripSummary>): TripSummary {
  return {
    id: "1",
    tripNumber: "R-001",
    origin: "Panevėžys",
    destination: "Oslas",
    tripDate: "2026-09-10",
    truckPlate: "LOV 141",
    paidKm: 900,
    emptyKm: 100,
    emptyFuelCents: 3348,
    revenueCents: 200000,
    totalCostCents: 150000,
    profitCents: 50000,
    marginPercent: 25,
    profitPerKm: 0.5,
    ...overrides,
  };
}

describe("emptyFuelCents", () => {
  it("skaičiuoja kurą tuštiems kilometrams", () => {
    // 100 km × 27 l/100 = 27 l × 1,24 € = 33,48 €.
    expect(emptyFuelCents(100, 27, 1.24)).toBe(3348);
  });

  it("be tuščių km kaštų nėra", () => {
    expect(emptyFuelCents(0, 27, 1.24)).toBe(0);
  });

  it("be normos ar kainos nespėja", () => {
    expect(emptyFuelCents(100, 0, 1.24)).toBe(0);
    expect(emptyFuelCents(100, 27, 0)).toBe(0);
  });
});

describe("summarizeEmptyKm", () => {
  it("dalį skaičiuoja nuo visos ridos", () => {
    // 100 iš 1000 yra 10 %, o ne 11,1 % nuo apmokamų.
    expect(summarizeEmptyKm([trip({})]).emptyShare).toBeCloseTo(10, 6);
  });

  it("sudeda kelis reisus", () => {
    const stats = summarizeEmptyKm([
      trip({ id: "1" }),
      trip({ id: "2", paidKm: 400, emptyKm: 100, emptyFuelCents: 3000 }),
    ]);

    expect(stats).toMatchObject({
      paidKm: 1300,
      emptyKm: 200,
      totalKm: 1500,
      emptyFuelCents: 6348,
    });
  });

  it("be reisų dalies nerodo", () => {
    expect(summarizeEmptyKm([]).emptyShare).toBeNull();
  });
});

describe("emptyKmByTruck", () => {
  it("blogiausią furą rodo viršuje", () => {
    const rows = emptyKmByTruck([
      trip({ id: "1", truckPlate: "LOV 141", paidKm: 900, emptyKm: 100 }),
      trip({ id: "2", truckPlate: "LSE 728", paidKm: 600, emptyKm: 400 }),
    ]);

    expect(rows[0].plate).toBe("LSE 728");
    expect(rows[0].emptyShare).toBeCloseTo(40, 6);
  });

  it("sudeda tos pačios furos reisus", () => {
    const rows = emptyKmByTruck([
      trip({ id: "1", paidKm: 900, emptyKm: 100 }),
      trip({ id: "2", paidKm: 900, emptyKm: 300 }),
    ]);

    expect(rows[0]).toMatchObject({ tripCount: 2, emptyKm: 400, totalKm: 2200 });
  });

  it("vienodos dalies furas rikiuoja pagal numerį", () => {
    const rows = emptyKmByTruck([
      trip({ id: "1", truckPlate: "LSE 728" }),
      trip({ id: "2", truckPlate: "LOV 141" }),
    ]);

    expect(rows.map((row) => row.plate)).toEqual(["LOV 141", "LSE 728"]);
  });

  it("tuščias sąrašas duoda tuščią rezultatą", () => {
    expect(emptyKmByTruck([])).toEqual([]);
  });
});
