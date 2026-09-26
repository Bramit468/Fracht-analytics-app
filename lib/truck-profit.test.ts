import { describe, expect, it } from "vitest";

import { summarizeByTruck } from "./truck-profit";
import type { TripSummary } from "./trips";

function trip(overrides: Partial<TripSummary>): TripSummary {
  return {
    id: "1",
    tripNumber: "R-1",
    origin: "Panevėžys",
    destination: "Oslas",
    tripDate: "2026-09-01",
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

describe("summarizeByTruck", () => {
  it("sudeda tos pačios furos reisus", () => {
    const rows = summarizeByTruck([
      trip({ id: "1" }),
      trip({ id: "2", paidKm: 500, revenueCents: 100000, totalCostCents: 90000, profitCents: 10000 }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      plate: "LOV 141",
      tripCount: 2,
      paidKm: 1500,
      revenueCents: 300000,
      totalCostCents: 240000,
      profitCents: 60000,
    });
  });

  it("maržą skaičiuoja nuo sumų, o ne kaip reisų vidurkį", () => {
    // Vidurkis būtų 30 %, nors didysis reisas sveria šešis kartus daugiau.
    const rows = summarizeByTruck([
      trip({ id: "1", revenueCents: 100000, profitCents: 50000 }),
      trip({ id: "2", revenueCents: 600000, profitCents: 60000 }),
    ]);

    expect(rows[0].marginPercent).toBeCloseTo((110000 / 700000) * 100, 6);
  });

  it("pelningiausią furą rodo pirmą", () => {
    const rows = summarizeByTruck([
      trip({ id: "1", truckPlate: "LSE 728", profitCents: 10000 }),
      trip({ id: "2", truckPlate: "LOV 141", profitCents: 90000 }),
      trip({ id: "3", truckPlate: "NNN 888", profitCents: -5000 }),
    ]);

    expect(rows.map((row) => row.plate)).toEqual(["LOV 141", "LSE 728", "NNN 888"]);
  });

  it("vienodo pelno furas rikiuoja pagal numerį", () => {
    // Be šito eilučių tvarka priklausytų nuo to, kuris reisas įrašytas anksčiau.
    const rows = summarizeByTruck([
      trip({ id: "1", truckPlate: "LSE 728" }),
      trip({ id: "2", truckPlate: "LOV 141" }),
    ]);

    expect(rows.map((row) => row.plate)).toEqual(["LOV 141", "LSE 728"]);
  });

  it("be pajamų maržos nerodo, o ne nulio", () => {
    // Nulis reikštų „dirbo be pelno", o čia pajamų apskritai nėra.
    const rows = summarizeByTruck([
      trip({ revenueCents: 0, totalCostCents: 30000, profitCents: -30000 }),
    ]);

    expect(rows[0].marginPercent).toBeNull();
  });

  it("be km pelno už km nerodo", () => {
    const rows = summarizeByTruck([trip({ paidKm: 0 })]);
    expect(rows[0].profitPerKm).toBeNull();
  });

  it("pelną už km skaičiuoja eurais", () => {
    const rows = summarizeByTruck([trip({ paidKm: 1000, profitCents: 50000 })]);
    expect(rows[0].profitPerKm).toBeCloseTo(0.5, 6);
  });

  it("tuščias sąrašas duoda tuščią rezultatą", () => {
    expect(summarizeByTruck([])).toEqual([]);
  });
});
