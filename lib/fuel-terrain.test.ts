import { describe, expect, it } from "vitest";

import { knownLoadFuel, terrainAdjustedFuel, terrainFactor } from "./fuel-terrain";

describe("žinomas krovinio svoris", () => {
  it("PTV su svoriu – be pataisų (per mažai duomenų koeficientui)", () => {
    expect(knownLoadFuel(25.73, 0)).toEqual({
      litresPer100Km: 25.73,
      note: "Kuras: 25,7 l/100 – PTV pagal maršrutą (nuolydžiai, keliai) ir 0,0 t krovinį.",
    });
    expect(knownLoadFuel(null, 10)).toBeNull();
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
