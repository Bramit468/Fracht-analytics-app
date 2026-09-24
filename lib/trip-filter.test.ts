import { describe, expect, it } from "vitest";

import { EMPTY_FILTER, filterTrips, sortTrips, tripPlates } from "./trip-filter";
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
    revenueCents: 200000,
    totalCostCents: 150000,
    profitCents: 50000,
    marginPercent: 25,
    profitPerKm: 0.5,
    ...overrides,
  };
}

const TRIPS = [
  trip({ id: "1", tripNumber: "R-001" }),
  trip({
    id: "2",
    tripNumber: "R-002",
    origin: "Kaunas",
    destination: "Hamburgas",
    truckPlate: "LSE 728",
    tripDate: "2026-08-20",
    profitCents: -7000,
    marginPercent: -5,
  }),
  trip({
    id: "3",
    tripNumber: "R-003",
    origin: "Vilnius",
    destination: "Varšuva",
    tripDate: "2026-09-25",
    profitCents: 90000,
    marginPercent: 40,
  }),
];

const TODAY = "2026-09-24";

describe("filterTrips", () => {
  it("tuščias filtras nieko nemeta", () => {
    expect(filterTrips(TRIPS, EMPTY_FILTER, TODAY)).toHaveLength(3);
  });

  it("randa pagal reiso numerį", () => {
    const found = filterTrips(TRIPS, { ...EMPTY_FILTER, query: "R-002" }, TODAY);
    expect(found.map((t) => t.id)).toEqual(["2"]);
  });

  it("randa be lietuviškų raidžių", () => {
    // Skubant rašoma „panevezys“, ir tai turi rasti „Panevėžys“.
    const found = filterTrips(TRIPS, { ...EMPTY_FILTER, query: "panevezys" }, TODAY);
    expect(found.map((t) => t.id)).toEqual(["1"]);
  });

  it("randa pagal miestą nepaisant raidžių dydžio", () => {
    const found = filterTrips(TRIPS, { ...EMPTY_FILTER, query: "HAMBURG" }, TODAY);
    expect(found.map((t) => t.id)).toEqual(["2"]);
  });

  it("randa pagal furos numerį", () => {
    const found = filterTrips(TRIPS, { ...EMPTY_FILTER, query: "lse" }, TODAY);
    expect(found.map((t) => t.id)).toEqual(["2"]);
  });

  it("atrenka pagal furą", () => {
    const found = filterTrips(TRIPS, { ...EMPTY_FILTER, plate: "LSE 728" }, TODAY);
    expect(found.map((t) => t.id)).toEqual(["2"]);
  });

  it("derina laikotarpį su paieška", () => {
    const found = filterTrips(TRIPS, { query: "", plate: "", period: "month" }, TODAY);
    expect(found.map((t) => t.id)).toEqual(["1", "3"]);
  });

  it("nieko neradus grąžina tuščią sąrašą", () => {
    expect(filterTrips(TRIPS, { ...EMPTY_FILTER, query: "Madridas" }, TODAY)).toEqual([]);
  });
});

describe("sortTrips", () => {
  it("naujausi viršuje", () => {
    expect(sortTrips(TRIPS, "date").map((t) => t.id)).toEqual(["3", "1", "2"]);
  });

  it("pelningiausi viršuje", () => {
    expect(sortTrips(TRIPS, "profit").map((t) => t.id)).toEqual(["3", "1", "2"]);
  });

  it("didžiausia marža viršuje", () => {
    expect(sortTrips(TRIPS, "margin").map((t) => t.id)).toEqual(["3", "1", "2"]);
  });

  it("reisus be maržos deda gale", () => {
    // Nulinės pajamos: marža nėra nei gera, nei bloga, dydžio tiesiog nėra.
    const beMarzos = trip({ id: "4", tripNumber: "R-004", marginPercent: null });
    const rikiuota = sortTrips([beMarzos, ...TRIPS], "margin");
    expect(rikiuota[rikiuota.length - 1].id).toBe("4");
  });

  it("pradinio sąrašo nekeičia", () => {
    const pradinis = [...TRIPS];
    sortTrips(TRIPS, "profit");
    expect(TRIPS).toEqual(pradinis);
  });
});

describe("tripPlates", () => {
  it("grąžina numerius be pasikartojimų, abėcėlės tvarka", () => {
    expect(tripPlates(TRIPS)).toEqual(["LOV 141", "LSE 728"]);
  });

  it("tuščias sąrašas duoda tuščią", () => {
    expect(tripPlates([])).toEqual([]);
  });
});
