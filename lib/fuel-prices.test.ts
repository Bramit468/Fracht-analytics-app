import { describe, expect, it } from "vitest";

import {
  fuelPricesByCountry,
  fuelPricesByMonth,
  savingsAtCheapestCents,
} from "./fuel-prices";
import type { Supply } from "./telematics-costs";

function supply(overrides: Partial<Supply>): Supply {
  return {
    plate: "LOV 141",
    date: "2026-09-10",
    kind: "diesel",
    quantity: 500,
    costCents: 62000,
    country: "LTU",
    ...overrides,
  };
}

describe("fuelPricesByCountry", () => {
  it("skaičiuoja svertinę kainą, o ne kainų vidurkį", () => {
    // 50 l po 2,00 € ir 500 l po 1,20 € duoda 1,27 €/l, o ne 1,60 €/l.
    const rows = fuelPricesByCountry([
      supply({ quantity: 50, costCents: 10000 }),
      supply({ quantity: 500, costCents: 60000 }),
    ]);

    expect(rows[0].pricePerL).toBeCloseTo(70000 / 100 / 550, 6);
  });

  it("pigiausią šalį rodo viršuje", () => {
    const rows = fuelPricesByCountry([
      supply({ country: "DEU", quantity: 100, costCents: 17000 }),
      supply({ country: "POL", quantity: 100, costCents: 13000 }),
    ]);

    expect(rows.map((row) => row.key)).toEqual(["POL", "DEU"]);
  });

  it("nenurodytą šalį palieka gale", () => {
    const rows = fuelPricesByCountry([
      supply({ country: null, quantity: 100, costCents: 10000 }),
      supply({ country: "DEU", quantity: 100, costCents: 17000 }),
    ]);

    expect(rows[rows.length - 1].key).toBe("");
  });

  it("neįtraukia ne dyzelino", () => {
    // AdBlue ir keliai kainos už kuro litrą neveikia.
    const rows = fuelPricesByCountry([
      supply({ kind: "adblue", quantity: 100, costCents: 5000 }),
      supply({ kind: "toll", quantity: null, costCents: 30000 }),
      supply({ quantity: 100, costCents: 12000 }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].litres).toBe(100);
  });

  it("praleidžia pirkimus be litrų", () => {
    // Suma be litrų pastumtų kainą, nors litrų prie jos nepridėtų.
    const rows = fuelPricesByCountry([
      supply({ quantity: null, costCents: 50000 }),
      supply({ quantity: 100, costCents: 12000 }),
    ]);

    expect(rows[0].pricePerL).toBeCloseTo(1.2, 6);
  });

  it("skaičiuoja pirkimų kiekį", () => {
    const rows = fuelPricesByCountry([supply({}), supply({})]);
    expect(rows[0].purchases).toBe(2);
  });

  it("tuščias sąrašas duoda tuščią rezultatą", () => {
    expect(fuelPricesByCountry([])).toEqual([]);
  });
});

describe("fuelPricesByMonth", () => {
  it("rikiuoja chronologiškai", () => {
    const rows = fuelPricesByMonth([
      supply({ date: "2026-09-10" }),
      supply({ date: "2026-07-05" }),
      supply({ date: "2026-08-20" }),
    ]);

    expect(rows.map((row) => row.key)).toEqual(["2026-07", "2026-08", "2026-09"]);
  });
});

describe("savingsAtCheapestCents", () => {
  it("parodo skirtumo dydį", () => {
    // 100 l po 1,70 € ir 100 l po 1,30 €: viską pirkus pigiau, 40 € mažiau.
    const rows = fuelPricesByCountry([
      supply({ country: "DEU", quantity: 100, costCents: 17000 }),
      supply({ country: "POL", quantity: 100, costCents: 13000 }),
    ]);

    expect(savingsAtCheapestCents(rows)).toBe(4000);
  });

  it("vienos šalies atveju taupyti nėra iš ko", () => {
    const rows = fuelPricesByCountry([supply({})]);
    expect(savingsAtCheapestCents(rows)).toBe(0);
  });

  it("tuščio sąrašo nesugadina", () => {
    expect(savingsAtCheapestCents([])).toBe(0);
  });
});
