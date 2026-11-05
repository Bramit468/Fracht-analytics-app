import { describe, expect, it } from "vitest";

import { adblueFromFuel, knownLoadFuel, ptvTripFuel, terrainAdjustedFuel, terrainFactor } from "./fuel-terrain";

describe("žinomas krovinio svoris", () => {
  it("PTV su svoriu – be pataisų (per mažai duomenų koeficientui)", () => {
    expect(knownLoadFuel(25.73, 0)).toEqual({
      litresPer100Km: 25.73,
      note: "Kuras: 25,7 l/100 – PTV pagal maršrutą (nuolydžiai, keliai) ir 0,0 t krovinį.",
    });
    expect(knownLoadFuel(null, 10)).toBeNull();
  });
});

describe("AdBlue nuo kuro", () => {
  it("6,92 % kuro; be kuro – 0", () => {
    expect(adblueFromFuel(30)).toBe(2.08);
    expect(adblueFromFuel(25.73)).toBe(1.78);
    expect(adblueFromFuel(0)).toBe(0);
  });
});

describe("viso reiso kuras tik iš PTV", () => {
  it("krovinio km su svoriu, tušti km su 0 kg – svertinė norma", () => {
    const fuel = ptvTripFuel({ paidKm: 1782, emptyKm: 1510, loadedL100: 30, emptyL100: 24, loadTonnes: 18.5 });
    // (1782 × 30 + 1510 × 24) / 3292 = 27,25
    expect(fuel?.litresPer100Km).toBe(27.25);
    expect(fuel?.note).toBe("Kuras: 27,3 l/100 – PTV: su kroviniu (18,5 t) 30,0 l/100 × 1 782 km, tuščia 24,0 l/100 × 1 510 km.");
  });

  it("be tuščių km – krovinio norma; be svorio – pasakoma", () => {
    expect(ptvTripFuel({ paidKm: 500, emptyKm: 0, loadedL100: 43.9, emptyL100: null, loadTonnes: null })).toEqual({
      litresPer100Km: 43.9,
      note: "Kuras: 43,9 l/100 – PTV: su kroviniu (krovinio svoris nežinomas – PTV laiko furą pilną) 43,9 l/100 × 500 km.",
    });
  });

  it("tušti km be PTV normos – ta pati norma; be PTV – null", () => {
    expect(ptvTripFuel({ paidKm: 100, emptyKm: 100, loadedL100: 30, emptyL100: null, loadTonnes: 10 })?.litresPer100Km).toBe(30);
    expect(ptvTripFuel({ paidKm: 100, emptyKm: 0, loadedL100: null, emptyL100: 24, loadTonnes: 10 })).toBeNull();
  });
});

describe("kuras pagal maršruto profilį", () => {
  it("įprastas maršrutas – furos vidurkis nekinta; kalnai – daugiau; lyguma – mažiau", () => {
    expect(terrainFactor(44.3)).toBe(1);
    expect(terrainFactor(52)).toBeCloseTo(1.174, 3);
    expect(terrainFactor(39)).toBeCloseTo(0.88, 2);
  });

  it("ribos 0,8–1,3: vienas keistas PTV skaičius nepadvigubina kuro", () => {
    expect(terrainFactor(90)).toBe(1.3);
    expect(terrainFactor(10)).toBe(0.8);
    expect(terrainFactor(null)).toBeNull();
    expect(terrainFactor(0)).toBeNull();
  });

  it("furos faktas × profilis, su paaiškinimu", () => {
    expect(terrainAdjustedFuel(30, 52)).toEqual({
      litresPer100Km: 35.22,
      note: "Kuras: 35,2 l/100 – furos 30 d. faktas 30,0 × maršruto profilis 1,17 (PTV: nuolydžiai, keliai, svoris; 52,0 prieš įprastus 44,3).",
    });
  });

  it("be furos fakto – PTV su parko kalibracija; be PTV – nieko nekeičiama", () => {
    expect(terrainAdjustedFuel(null, 44.3)?.litresPer100Km).toBeCloseTo(31.45, 2);
    expect(terrainAdjustedFuel(0, 44.3)?.note).toContain("parko kalibracija");
    expect(terrainAdjustedFuel(30, null)).toBeNull();
  });
});
