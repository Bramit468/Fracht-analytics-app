import { describe, expect, it } from "vitest";

import { routeKey, summarizeByRoute } from "./route-profit";
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

describe("routeKey", () => {
  it("nepaiso raidžių dydžio ir diakritikos", () => {
    expect(routeKey("Panevėžys", "Oslas")).toBe(routeKey("panevezys", "OSLAS"));
  });

  it("nepaiso tarpų kraštuose ir dvigubų tarpų", () => {
    expect(routeKey("  Panevėžys ", "Oslas")).toBe(routeKey("Panevėžys", "Oslas"));
  });

  it("kryptis skiria", () => {
    expect(routeKey("Oslas", "Panevėžys")).not.toBe(routeKey("Panevėžys", "Oslas"));
  });
});

describe("summarizeByRoute", () => {
  it("sudeda tos pačios krypties reisus, nors parašyta skirtingai", () => {
    // Be sulyginimo kryptis suskiltų į dvi ir abi atrodytų dvigubai mažesnės.
    const rows = summarizeByRoute([
      trip({ id: "1" }),
      trip({ id: "2", origin: "panevezys", destination: "oslas" }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tripCount: 2, profitCents: 100000 });
  });

  it("rodo pirmą sutiktą rašybą", () => {
    const rows = summarizeByRoute([
      trip({ id: "1" }),
      trip({ id: "2", origin: "panevezys", destination: "oslas" }),
    ]);

    expect(rows[0]).toMatchObject({ origin: "Panevėžys", destination: "Oslas" });
  });

  it("priešingų krypčių nesujungia", () => {
    // Atgalinis reisas paprastai kainuoja visai kitaip — būtent tai ir įdomu.
    const rows = summarizeByRoute([
      trip({ id: "1" }),
      trip({ id: "2", origin: "Oslas", destination: "Panevėžys", profitCents: 10000 }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.origin)).toEqual(["Panevėžys", "Oslas"]);
  });

  it("pelningiausia kryptis viršuje", () => {
    const rows = summarizeByRoute([
      trip({ id: "1", destination: "Ryga", profitCents: 2000 }),
      trip({ id: "2", destination: "Oslas", profitCents: 80000 }),
      trip({ id: "3", destination: "Varšuva", profitCents: -9000 }),
    ]);

    expect(rows.map((row) => row.destination)).toEqual(["Oslas", "Ryga", "Varšuva"]);
  });

  it("maržą skaičiuoja nuo sumų", () => {
    const rows = summarizeByRoute([
      trip({ id: "1", revenueCents: 100000, profitCents: 50000 }),
      trip({ id: "2", revenueCents: 600000, profitCents: 60000 }),
    ]);

    expect(rows[0].marginPercent).toBeCloseTo((110000 / 700000) * 100, 6);
  });

  it("be km pelno už km nerodo", () => {
    expect(summarizeByRoute([trip({ paidKm: 0 })])[0].profitPerKm).toBeNull();
  });

  it("tuščias sąrašas duoda tuščią rezultatą", () => {
    expect(summarizeByRoute([])).toEqual([]);
  });
});
