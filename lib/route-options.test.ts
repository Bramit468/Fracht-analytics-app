import { describe, expect, it } from "vitest";

import { compareRouteOptions, extraCostCents, fuelCostCents } from "./route-options";
import type { RouteOptionSource } from "./route-options";

function option(overrides: Partial<RouteOptionSource>): RouteOptionSource {
  return {
    routeId: null,
    km: 2054,
    travelHours: 29.5,
    travelMinutes: 1770,
    trafficDelayMinutes: 7,
    tollCents: 48340,
    bridgesCents: 48340,
    ferriesCents: 0,
    tunnelsCents: 0,
    ferryDetected: false,
    ferryNames: [],
    byCountry: [],
    violated: false,
    violations: [],
    ...overrides,
  };
}

const FUEL = { litresPer100Km: 27, priceCentsPerLitre: 124 };

describe("fuelCostCents", () => {
  it("skaičiuoja kurą centais", () => {
    // 1000 km × 27 l/100 = 270 l × 1,24 € = 334,80 €.
    expect(fuelCostCents(1000, FUEL)).toBe(33480);
  });

  it("apvalina vieną kartą", () => {
    expect(fuelCostCents(2054.37, FUEL)).toBe(Math.round((2054.37 * 27 * 124) / 100));
  });

  it("be km arba be normos kuro nėra", () => {
    expect(fuelCostCents(0, FUEL)).toBe(0);
    expect(fuelCostCents(100, { litresPer100Km: 0, priceCentsPerLitre: 124 })).toBe(0);
  });
});

describe("compareRouteOptions", () => {
  const brangus = option({ tollCents: 48340, km: 2054, travelMinutes: 1770 });
  const pigesnis = option({ routeId: "a", tollCents: 35045, km: 2055, travelMinutes: 1842 });

  it("sudeda kelius ir kurą", () => {
    const [first] = compareRouteOptions([pigesnis], FUEL);

    expect(first.fuelCents).toBe(fuelCostCents(2055, FUEL));
    expect(first.totalCents).toBe(35045 + first.fuelCents);
  });

  it("pigiausią rodo viršuje ir pažymi", () => {
    const options = compareRouteOptions([brangus, pigesnis], FUEL);

    expect(options[0].routeId).toBe("a");
    expect(options[0].cheapest).toBe(true);
    expect(options[1].cheapest).toBe(false);
  });

  it("greičiausią pažymi atskirai", () => {
    // Pigiausias ir greičiausias dažnai yra skirtingi keliai – tai ir įdomu.
    const options = compareRouteOptions([brangus, pigesnis], FUEL);

    expect(options.find((row) => row.fastest)?.routeId).toBeNull();
    expect(options.find((row) => row.cheapest)?.routeId).toBe("a");
  });

  it("nežinomos kelto kainos nelaiko nuliu", () => {
    // Paldiski–Kapellskär variantas su 14 € kelių atrodytų pigiausias, nors
    // kelto bilietas gali kainuoti kelis šimtus.
    const keltas = option({
      routeId: "b",
      km: 1292,
      tollCents: 1413,
      ferryDetected: true,
      ferriesCents: 0,
      ferryNames: ["Paldiski-Kapellskär"],
    });

    const options = compareRouteOptions([brangus, keltas], FUEL);
    const nezinomas = options.find((row) => row.routeId === "b");

    expect(nezinomas?.ferryPriceUnknown).toBe(true);
    expect(nezinomas?.totalCents).toBeNull();
    expect(nezinomas?.cheapest).toBe(false);
    // Be sumos variantas lieka gale, o ne apsimeta pigiausiu.
    expect(options[options.length - 1].routeId).toBe("b");
  });

  it("žinomą kelto kainą įskaičiuoja", () => {
    const keltas = option({
      routeId: "c",
      tollCents: 20000,
      ferriesCents: 12000,
      ferryDetected: true,
      ferryNames: ["Rostock-Gedser"],
    });

    const [first] = compareRouteOptions([keltas], FUEL);
    expect(first.ferryPriceUnknown).toBe(false);
    expect(first.totalCents).toBe(20000 + first.fuelCents);
  });

  it("vienas variantas veikia kaip anksčiau", () => {
    const options = compareRouteOptions([brangus], FUEL);

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ cheapest: true, fastest: true });
  });

  it("tuščias sąrašas nieko nesugadina", () => {
    expect(compareRouteOptions([], FUEL)).toEqual([]);
  });
});

describe("extraCostCents", () => {
  it("rodo, kiek brangesnis už pigiausią", () => {
    const options = compareRouteOptions(
      [option({ tollCents: 48340 }), option({ routeId: "a", tollCents: 35045 })],
      FUEL,
    );

    expect(extraCostCents(options[1], options)).toBe(48340 - 35045);
  });

  it("be kainos skirtumo neskaičiuoja", () => {
    const options = compareRouteOptions(
      [option({ routeId: "b", ferryDetected: true, ferriesCents: 0 })],
      FUEL,
    );

    expect(extraCostCents(options[0], options)).toBeNull();
  });
});
