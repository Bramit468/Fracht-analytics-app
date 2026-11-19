import { describe, expect, it } from "vitest";

import { proratedActualCents, truckReport } from "./truck-report";
import type { MonthCostRow } from "./truck-month-costs";
import type { TripSummary } from "./trips";

function month(truckId: string, value: string, driverCents: number): MonthCostRow {
  return { truck_id: truckId, month: value, driver_cents: driverCents, leasing_cents: 0, insurance_cents: 0, vehicle_tax_cents: 0, repairs_cents: 0, tires_cents: 0, overhead_cents: 0, other_cents: 0 };
}

function trip(overrides: Partial<TripSummary>): TripSummary {
  return {
    id: "1", tripNumber: "R-1", origin: "A", destination: "B", tripDate: "2026-10-05", truckPlate: "MHE 763",
    paidKm: 436, days: 2, emptyKm: 400, emptyFuelCents: 0, revenueCents: 120000, totalCostCents: 90000, profitCents: 30000,
    marginPercent: 25, profitPerKm: null, profitPerDayCents: null, roadByCountry: [],
    costs: { drivers: 0, perDiem: 0, truck: 0, repairs: 0, management: 0, trailer: 0, fuel: 35000, adblue: 1500, roads: 3500 },
    ...overrides,
  };
}

describe("proratedActualCents", () => {
  it("visas mėnuo – visa suma; savaitė – jos dienų dalis, ir per mėnesio ribą", () => {
    const rows = [month("t", "2026-10-01", 310000), month("t", "2026-11-01", 300000)];
    expect(proratedActualCents(rows, "2026-10-01", "2026-10-31")).toEqual({ cents: 310000, missing: [] });
    // 10-29..11-04: 3 spalio (3/31) + 4 lapkričio (4/30) dienos.
    expect(proratedActualCents(rows, "2026-10-29", "2026-11-04").cents).toBe(Math.round(30000 + 40000));
  });

  it("neįvestas mėnuo – grąžinamas trūkstamų sąraše", () => {
    expect(proratedActualCents([month("t", "2026-10-01", 1)], "2026-10-15", "2026-11-10").missing).toEqual(["2026-11"]);
  });
});

describe("truckReport", () => {
  it("realus pelnas = pajamos − kuras/AdBlue/keliai − faktiniai; prastovos ir užimtumas iš kalendoriaus", () => {
    const [row] = truckReport({
      plates: ["MHE 763"],
      // Du kroviniai po 2 paras, spalis – 31 d.
      trips: [trip({}), trip({ id: "2", tripDate: "2026-10-12" })],
      monthCosts: [{ ...month("t", "2026-10-01", 620000), plate: "MHE763" }],
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(row).toMatchObject({
      revenueCents: 240000,
      directCents: 80000,
      grossCents: 160000,
      tripProfitCents: 60000,
      actualCents: 620000,
      realProfitCents: -460000,
      calendarDays: 31,
      loadDays: 4,
      idleDays: 27,
      // 27 d. × 6 200 € / 31 d.
      idleCostCents: 540000,
      realProfitPerDayCents: Math.round(-460000 / 31),
    });
    expect(row.utilizationPercent).toBeCloseTo((4 / 31) * 100);
  });

  it("be faktinių kaštų – realaus pelno nėra, trūkstamas mėnuo nurodomas; fura be nieko – praleidžiama", () => {
    const rows = truckReport({ plates: ["MHE 763", "LOV 141"], trips: [trip({})], monthCosts: [], from: "2026-10-01", to: "2026-10-31" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ realProfitCents: null, idleCostCents: null, missingMonths: ["2026-10"] });
  });

  it("stovėjusi fura su kaštais, bet be reisų – rodoma su visu nuostoliu", () => {
    const [row] = truckReport({ plates: ["LOV 141"], trips: [], monthCosts: [{ ...month("x", "2026-10-01", 310000), plate: "LOV 141" }], from: "2026-10-01", to: "2026-10-31" });
    expect(row).toMatchObject({ tripCount: 0, realProfitCents: -310000, idleDays: 31, utilizationPercent: 0 });
  });
});
