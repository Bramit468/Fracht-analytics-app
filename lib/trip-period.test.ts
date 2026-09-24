import { describe, expect, it } from "vitest";

import { filterByPeriod, periodRange, PERIODS } from "./trip-period";
import type { TripSummary } from "./trips";

function trip(id: string, tripDate: string): TripSummary {
  return {
    id,
    tripNumber: `R-${id}`,
    origin: "Panevėžys",
    destination: "Oslas",
    tripDate,
    truckPlate: "LOV 141",
    paidKm: 1000,
    revenueCents: 200000,
    totalCostCents: 150000,
    profitCents: 50000,
    marginPercent: 25,
    profitPerKm: 0.5,
  };
}

describe("periodRange", () => {
  it("šis mėnuo apima visą mėnesį", () => {
    expect(periodRange("month", "2026-09-24")).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("praėjęs mėnuo sausį yra praėjusių metų gruodis", () => {
    expect(periodRange("previousMonth", "2026-01-15")).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });

  it("vasario ilgį ima iš kalendoriaus", () => {
    // 2028-ieji keliamieji: 29 dienos.
    expect(periodRange("month", "2028-02-10")?.to).toBe("2028-02-29");
    expect(periodRange("month", "2026-02-10")?.to).toBe("2026-02-28");
  });

  it("šie metai apima visus metus", () => {
    expect(periodRange("year", "2026-09-24")).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });

  it("„visi“ ribų neturi", () => {
    expect(periodRange("all", "2026-09-24")).toBeNull();
  });

  it("netinkamą datą laiko „visais“", () => {
    // Geriau parodyti viską, nei tuščią suvestinę be paaiškinimo.
    expect(periodRange("month", "ne data")).toBeNull();
  });
});

describe("filterByPeriod", () => {
  const trips = [
    trip("1", "2026-08-31"),
    trip("2", "2026-09-01"),
    trip("3", "2026-09-30"),
    trip("4", "2026-10-01"),
    trip("5", "2025-12-15"),
  ];

  it("ribos imtinės", () => {
    // Mėnesio pirma ir paskutinė diena priklauso tam mėnesiui.
    const ids = filterByPeriod(trips, "month", "2026-09-24").map((t) => t.id);
    expect(ids).toEqual(["2", "3"]);
  });

  it("praėjęs mėnuo paima tik jį", () => {
    expect(filterByPeriod(trips, "previousMonth", "2026-09-24").map((t) => t.id)).toEqual([
      "1",
    ]);
  });

  it("metai neįtraukia praėjusių metų", () => {
    expect(filterByPeriod(trips, "year", "2026-09-24").map((t) => t.id)).toEqual([
      "1",
      "2",
      "3",
      "4",
    ]);
  });

  it("„visi“ grąžina viską", () => {
    expect(filterByPeriod(trips, "all", "2026-09-24")).toHaveLength(5);
  });

  it("tuščias sąrašas lieka tuščias", () => {
    expect(filterByPeriod([], "month", "2026-09-24")).toEqual([]);
  });
});

describe("PERIODS", () => {
  it("kiekvienas pasirinkimas turi pavadinimą", () => {
    for (const period of PERIODS) {
      expect(period.label).toBeTruthy();
    }
  });
});
