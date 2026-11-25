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

  it("km be krovinio: paros rida − reisų km, kuras pagal reisų kainą už km, atimamas iš realaus pelno", () => {
    const [row] = truckReport({
      plates: ["MHE 763"],
      // Reisas: 436 + 400 = 836 km, kuras + AdBlue 365 € → 0,4366 €/km.
      trips: [trip({})],
      monthCosts: [{ ...month("t", "2026-10-01", 0), plate: "MHE 763" }],
      dailyKm: [{ plate: "MHE 763", date: "2026-10-05", km: 836 }, { plate: "MHE 763", date: "2026-10-25", km: 200 }, { plate: "MHE 763", date: "2026-11-02", km: 999 }],
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(row.kmWithoutLoad).toBe(200);
    expect(row.kmWithoutLoadCents).toBe(Math.round((200 * 36500) / 836));
    expect(row.realProfitCents).toBe(80000 - Math.round((200 * 36500) / 836));
  });

  it("km be krovinio: reisas per laikotarpio ribą – tik jame esančių parų dalis; prieš laikotarpį prasidėjęs – irgi", () => {
    // 10-30, 4 paros, 1000 km: spaliui 2/4 = 500. 09-30, 2 paros, 400 km: spaliui 200.
    const late = trip({ id: "2", tripDate: "2026-10-30", days: 4, paidKm: 1000, emptyKm: 0 });
    const early = trip({ id: "3", tripDate: "2026-09-30", days: 2, paidKm: 400, emptyKm: 0 });
    const [row] = truckReport({
      plates: ["MHE 763"],
      trips: [late],
      kmTrips: [early, late],
      monthCosts: [],
      dailyKm: [{ plate: "MHE 763", date: "2026-10-01", km: 300 }, { plate: "MHE 763", date: "2026-10-31", km: 500 }, { plate: "MHE 763", date: "2026-11-01", km: 500 }],
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(row.kmWithoutLoad).toBe(800 - 500 - 200);
  });

  it("km be krovinio: importuotas reisas – tikros važiavimo dienos ir jų odometras (savaitgalio prastova km negauna)", () => {
    // MLV 023: 1,75 paros nuo 10-29, bet važiavo iki 11-02; 10-31 ir 11-01 stovėjo.
    const trip1 = trip({ id: "2", tripDate: "2026-10-29", days: 1.75, paidKm: 1149, emptyKm: 0, driven: ["2026-10-29", "2026-11-02"] });
    const [row] = truckReport({
      plates: ["MHE 763"],
      trips: [trip1],
      monthCosts: [],
      dailyKm: [
        { plate: "MHE 763", date: "2026-10-29", km: 400 }, { plate: "MHE 763", date: "2026-10-30", km: 403 },
        { plate: "MHE 763", date: "2026-10-31", km: 0 }, { plate: "MHE 763", date: "2026-11-01", km: 0 },
        { plate: "MHE 763", date: "2026-11-02", km: 346 },
      ],
      from: "2026-10-01",
      to: "2026-10-31",
    });
    // Spaliui – 803 / 1 149 reiso km, t. y. tiek, kiek tą mėnesį nuvažiuota.
    expect(row.kmWithoutLoad).toBe(0);
  });

  it("km be krovinio: reisų km daugiau nei odometre – neigiami, kuras neatimamas; dienos be Telematikos nelyginamos", () => {
    const [row] = truckReport({
      plates: ["MHE 763"],
      trips: [trip({})],
      monthCosts: [{ ...month("t", "2026-10-01", 0), plate: "MHE 763" }],
      // Telematika tik nuo 10-05: rugsėjo pradžios reisai su ja nelyginami.
      kmTrips: [trip({}), trip({ id: "2", tripDate: "2026-10-01", days: 1, paidKm: 900, emptyKm: 0 })],
      dailyKm: [{ plate: "MHE 763", date: "2026-10-05", km: 400 }, { plate: "MHE 763", date: "2026-10-06", km: 336 }],
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(row).toMatchObject({ kmWithoutLoad: -100, kmWithoutLoadCents: 0, realProfitCents: 80000 });
  });

  it("be paros ridos – km be krovinio nežinomi, realus pelnas be jų", () => {
    const [row] = truckReport({ plates: ["MHE 763"], trips: [trip({})], monthCosts: [{ ...month("t", "2026-10-01", 0), plate: "MHE 763" }], from: "2026-10-01", to: "2026-10-31" });
    expect(row).toMatchObject({ kmWithoutLoad: null, kmWithoutLoadCents: null, realProfitCents: 80000 });
  });

  it("stovėjusi fura su kaštais, bet be reisų – rodoma su visu nuostoliu", () => {
    const [row] = truckReport({ plates: ["LOV 141"], trips: [], monthCosts: [{ ...month("x", "2026-10-01", 310000), plate: "LOV 141" }], from: "2026-10-01", to: "2026-10-31" });
    expect(row).toMatchObject({ tripCount: 0, realProfitCents: -310000, idleDays: 31, utilizationPercent: 0 });
  });
});
