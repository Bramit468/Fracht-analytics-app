import { describe, expect, it } from "vitest";

import type { TripResult } from "./calc";
import type { ActualCosts } from "./telematics-costs";
import { compareTripToActuals, type PlannedInputs } from "./trip-variance";

/** Reisas, suskaičiuotas pagal normas: 25 l/100, 1,30 €/l. */
const TRIP: PlannedInputs = {
  fuel_l_per_100km: 25,
  fuel_price: 1.3,
  paid_km: 1000,
  empty_km: 100,
};

const PLANNED: TripResult = {
  totalKm: 1100,
  fuelCents: 35750, // 1100 km × 25 l/100 × 1,30 €
  adblueCents: 1000,
  roadCents: 20000,
  truckCents: 80700,
  totalCostCents: 137450,
  revenueCents: 200000,
  profitCents: 62550,
  marginPercent: 31.3,
  costPerKm: 1.3745,
  profitPerKm: 0.6255,
};

const ACTUAL: ActualCosts = {
  plate: "LOV 141",
  from: "2026-09-01",
  to: "2026-09-03",
  days: 3,
  km: 1150,
  fuelL: 313.95,
  dieselCents: 42000,
  adblueCents: 900,
  tollCents: 27040,
  otherCents: 0,
  totalCents: 69940,
  adblueL: 20,
  fuelPricePerL: 1.34,
  adbluePricePerL: 0.45,
  litresPer100Km: 27.3,
};

describe("compareTripToActuals", () => {
  it("parodo skirtumą kurui, AdBlue ir keliams", () => {
    const { lines } = compareTripToActuals(TRIP, PLANNED, ACTUAL);

    expect(lines).toEqual([
      { key: "fuel", plannedCents: 35750, actualCents: 42000, diffCents: 6250 },
      { key: "adblue", plannedCents: 1000, actualCents: 900, diffCents: -100 },
      { key: "road", plannedCents: 20000, actualCents: 27040, diffCents: 7040 },
    ]);
  });

  it("pelno poveikis yra kintamų kaštų skirtumų suma", () => {
    const { profitImpactCents, actualProfitCents } = compareTripToActuals(TRIP, PLANNED, ACTUAL);

    // 6250 - 100 + 7040 = 13190 centų brangiau, nei planuota.
    expect(profitImpactCents).toBe(13190);
    expect(actualProfitCents).toBe(62550 - 13190);
  });

  it("furos paros kaštai į skirtumą nepatenka", () => {
    // Telematika jų neturi, tad jie abiejose pusėse vienodi. Jei įsivelčiau
    // jie, pelno skirtumas taptų beprasmis.
    const { lines } = compareTripToActuals(TRIP, PLANNED, ACTUAL);

    expect(lines.map((line) => line.key)).not.toContain("truck");
  });

  it("parodo priežastis, ne tik sumas", () => {
    const { litresPer100Km, fuelPricePerL, km } = compareTripToActuals(TRIP, PLANNED, ACTUAL);

    expect(litresPer100Km.planned).toBe(25);
    expect(litresPer100Km.actual).toBe(27.3);
    // Skirtumas skaičiuojamas slankiuoju kableliu, tad lyginamas apytiksliai:
    // tai rodoma reikšmė, ne pinigai, o pinigai laikomi centais.
    expect(litresPer100Km.diff).toBeCloseTo(2.3, 10);
    expect(fuelPricePerL.actual).toBe(1.34);
    expect(km).toEqual({ planned: 1100, actual: 1150, diff: 50 });
  });

  it("trūkstamas faktas grąžina null, o ne nulį", () => {
    // Nulis reikštų „fura degino 0 l/100", o čia tiesiog nežinoma. Sudėjus
    // į lentelę tas skirtumas atrodytų kaip įspūdinga ekonomija.
    const tuscias: ActualCosts = {
      ...ACTUAL,
      km: 0,
      fuelL: 0,
      dieselCents: 0,
      adblueCents: 0,
      tollCents: 0,
      totalCents: 0,
      litresPer100Km: null,
      fuelPricePerL: null,
      adbluePricePerL: null,
    };

    const variance = compareTripToActuals(TRIP, PLANNED, tuscias);

    expect(variance.litresPer100Km.actual).toBeNull();
    expect(variance.litresPer100Km.diff).toBeNull();
    expect(variance.km.actual).toBeNull();
    expect(variance.fuelPricePerL.diff).toBeNull();
  });

  it("pigesnis faktas duoda neigiamą poveikį ir didesnį pelną", () => {
    const pigiau: ActualCosts = { ...ACTUAL, dieselCents: 30000, adblueCents: 1000, tollCents: 20000 };
    const { profitImpactCents, actualProfitCents } = compareTripToActuals(TRIP, PLANNED, pigiau);

    expect(profitImpactCents).toBe(-5750);
    expect(actualProfitCents).toBeGreaterThan(62550);
  });
});
