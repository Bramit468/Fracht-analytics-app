import { describe, expect, it } from "vitest";

import { costInsights, fleetFuelPricePerL } from "./cost-insights";
import type { FuelPriceRow } from "./fuel-prices";
import type { ActualCosts } from "./telematics-costs";

function truck(plate: string, overrides: Partial<ActualCosts>): ActualCosts {
  return {
    plate,
    from: "2026-09-01",
    to: "2026-09-30",
    days: 30,
    km: 10_000,
    fuelL: 0,
    dieselCents: 0,
    adblueCents: 0,
    tollCents: 0,
    otherCents: 0,
    totalCents: 0,
    adblueL: 0,
    fuelPricePerL: null,
    adbluePricePerL: null,
    litresPer100Km: null,
    ...overrides,
  };
}

function country(key: string, litres: number, costCents: number): FuelPriceRow {
  return { key, litres, costCents, purchases: 1, pricePerL: litres > 0 ? costCents / 100 / litres : null };
}

// Parkas vidutiniškai moka 1,50 €/l: 1000 l po 1,40 ir 1000 l po 1,60.
const COUNTRIES = [country("PL", 1000, 140_000), country("DE", 1000, 160_000)];

describe("fleetFuelPricePerL", () => {
  it("svertinė: visa suma / visi litrai", () => {
    expect(fleetFuelPricePerL(COUNTRIES)).toBeCloseTo(1.5, 10);
  });

  it("be pirkimų – nežinoma", () => {
    expect(fleetFuelPricePerL([])).toBeNull();
  });
});

describe("costInsights – sąnaudos", () => {
  const FLEET = [
    truck("AAA 001", { litresPer100Km: 28 }),
    truck("AAA 002", { litresPer100Km: 29 }),
    truck("AAA 003", { litresPer100Km: 30 }),
    truck("AAA 004", { litresPer100Km: 35, fuelPricePerL: 1.5 }),
  ];

  it("randa godžią furą ir suskaičiuoja permoką", () => {
    const found = costInsights(FLEET, []).filter((insight) => insight.kind === "consumption");

    // Mediana 29,5; 10 000 km × 5,5 l/100 km = 550 l × 1,50 € = 825 €.
    expect(found).toHaveLength(1);
    expect(found[0].plate).toBe("AAA 004");
    expect(found[0].cents).toBe(82_500);
  });

  it("lygina su mediana, ne su vidurkiu", () => {
    // Vidurkis būtų 30,5 – 30 l/100 km fura liktų „normali“ bet kuriuo atveju,
    // o 35 l/100 km fura su vidurkiu atrodytų mažiau išsiskirianti.
    const found = costInsights(FLEET, []);
    expect(found[0].title).toContain("5,5 l daugiau");
  });

  it("trumpos ridos furų nelygina", () => {
    const short = FLEET.map((row) => ({ ...row, km: 500 }));
    expect(costInsights(short, [])).toEqual([]);
  });

  it("be bent trijų furų tipinės nėra", () => {
    expect(costInsights(FLEET.slice(2), [])).toEqual([]);
  });

  it("be kainos naudoja parko kainą", () => {
    const rows = FLEET.map((row) => ({ ...row, fuelPricePerL: null }));
    const found = costInsights(rows, COUNTRIES).filter((insight) => insight.kind === "consumption");
    expect(found[0].cents).toBe(82_500);
  });

  it("be jokios kainos sumos nespėja", () => {
    const rows = FLEET.map((row) => ({ ...row, fuelPricePerL: null }));
    expect(costInsights(rows, [])).toEqual([]);
  });
});

describe("costInsights – kaina už litrą", () => {
  it("randa brangiau perkančią furą", () => {
    // 1600 € / 1,60 = 1000 l × (1,60 − 1,50) = 100 €.
    const found = costInsights(
      [truck("BBB 001", { fuelPricePerL: 1.6, dieselCents: 160_000 })],
      COUNTRIES,
    ).filter((insight) => insight.kind === "price");

    expect(found).toHaveLength(1);
    expect(found[0].cents).toBe(10_000);
  });

  it("kelių centų skirtumo nelaiko išvada", () => {
    const found = costInsights(
      [truck("BBB 001", { fuelPricePerL: 1.52, dieselCents: 1_520_000 })],
      COUNTRIES,
    ).filter((insight) => insight.kind === "price");

    expect(found).toEqual([]);
  });
});

describe("costInsights – šalys", () => {
  it("suma ta pati, kaip kuro kainų lentelėje", () => {
    // 3000 € − 2000 l × 1,40 € = 200 €.
    const found = costInsights([], COUNTRIES);

    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("country");
    expect(found[0].cents).toBe(20_000);
    expect(found[0].title).toContain("PL");
    expect(found[0].title).toContain("DE");
  });

  it("smulkmenų nerodo", () => {
    expect(costInsights([], [country("PL", 100, 14_000), country("DE", 100, 14_100)])).toEqual([]);
  });
});

it("didžiausia suma viršuje", () => {
  const found = costInsights(
    [
      truck("AAA 001", { litresPer100Km: 28 }),
      truck("AAA 002", { litresPer100Km: 29 }),
      truck("AAA 003", { litresPer100Km: 30 }),
      truck("AAA 004", { litresPer100Km: 35, fuelPricePerL: 1.5 }),
    ],
    COUNTRIES,
  );

  const amounts = found.map((insight) => insight.cents);
  expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
});
