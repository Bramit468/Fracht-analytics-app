import { describe, expect, it } from "vitest";

import {
  consumptionGapPercent,
  hasWeights,
  routeEmissions,
  weightParams,
} from "./ptv-emissions";

/** Tikras PTV atsakymo fragmentas, Panevėžys–Oslas su 20 t kroviniu. */
const PAYLOAD = {
  distance: 2054000,
  emissions: {
    en16258_2012: {
      fuelConsumption: 613.4998,
      co2eTankToWheel: 1968.4312,
      co2eWellToWheel: 2388.7009,
      energyUseTankToWheel: 26257.7,
    },
  },
};

describe("weightParams", () => {
  it("perduoda nurodytus svorius", () => {
    expect(weightParams({ emptyWeightKg: 15000, loadWeightKg: 20000 })).toEqual({
      "vehicle[emptyWeight]": "15000",
      "vehicle[loadWeight]": "20000",
    });
  });

  it("nenurodyto svorio nespėja", () => {
    // Prasimanytas svoris duotų tikslų atrodantį, bet neteisingą kuro skaičių.
    expect(weightParams({ emptyWeightKg: null, loadWeightKg: undefined })).toEqual({});
  });

  it("nulio ir neigiamo svorio neperduoda", () => {
    expect(weightParams({ emptyWeightKg: 0, loadWeightKg: -500 })).toEqual({});
  });

  it("apvalina iki kilogramų", () => {
    expect(weightParams({ loadWeightKg: 20500.6 })["vehicle[loadWeight]"]).toBe("20501");
  });
});

describe("hasWeights", () => {
  it("mato, kad svorių nėra", () => {
    expect(hasWeights({})).toBe(false);
  });

  it("mato bent vieną svorį", () => {
    expect(hasWeights({ loadWeightKg: 12000 })).toBe(true);
  });
});

describe("routeEmissions", () => {
  it("kilogramus verčia litrais", () => {
    // PTV grąžina masę. Palaikius ją litrais, kuras atrodytų penktadaliu
    // mažesnis, o skaičius vis tiek atrodytų tikėtinas.
    const emissions = routeEmissions(PAYLOAD, 2054);

    expect(emissions?.fuelKg).toBe(613.5);
    expect(emissions?.fuelLitres).toBeCloseTo(737.4, 1);
  });

  it("skaičiuoja sąnaudas litrais šimtui km", () => {
    expect(routeEmissions(PAYLOAD, 2054)?.litresPer100Km).toBeCloseTo(35.9, 1);
  });

  it("CO2e verčia tonomis", () => {
    // Sutartyse ir konkursuose kalbama tonomis, ne kilogramais.
    expect(routeEmissions(PAYLOAD, 2054)?.co2eWellToWheelTonnes).toBeCloseTo(2.389, 3);
    expect(routeEmissions(PAYLOAD, 2054)?.co2eTankToWheelTonnes).toBeCloseTo(1.968, 3);
  });

  it("neieško metodo pavadinimo pagal raktą", () => {
    // Paprašius kito metodo raktas pasikeistų, ir kietai įrašytas vardas tyliai
    // grąžintų null.
    const kitas = { emissions: { iso14083_2023: { fuelConsumption: 500, co2eWellToWheel: 1000 } } };
    expect(routeEmissions(kitas, 1000)?.fuelKg).toBe(500);
  });

  it("be maršruto ilgio sąnaudų nerodo", () => {
    expect(routeEmissions(PAYLOAD, 0)?.litresPer100Km).toBeNull();
  });

  it("be emisijų grąžina null", () => {
    expect(routeEmissions({ distance: 1000 }, 1)).toBeNull();
    expect(routeEmissions(null, 1)).toBeNull();
  });
});

describe("consumptionGapPercent", () => {
  it("rodo, kiek PTV daugiau už normą", () => {
    expect(consumptionGapPercent(30, 25)).toBeCloseTo(20, 6);
  });

  it("rodo ir mažiau", () => {
    expect(consumptionGapPercent(20, 25)).toBeCloseTo(-20, 6);
  });

  it("nesant normos skirtumo neskaičiuoja", () => {
    expect(consumptionGapPercent(30, 0)).toBeNull();
    expect(consumptionGapPercent(null, 25)).toBeNull();
  });
});
