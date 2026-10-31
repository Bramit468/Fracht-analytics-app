import { describe, expect, it } from "vitest";

import { contractFare, ferryMatches, ferryPorts, parseFerryRate, type FerryRate } from "./ferry-rates";

const rate = (label: string, price_cents: number): FerryRate => ({ id: label, label, price_cents, note: null, updated_at: "" });

describe("keltų sutartinės kainos", () => {
  it("uostai be diakritikos ir skyrybos", () => {
    expect(ferryPorts("Liepāja – Travemünde")).toEqual(["liepaja", "travemunde"]);
    expect(ferryPorts("Puttgarden - Rødby")).toEqual(["puttgarden", "rodby"]);
    expect(ferryPorts("Świnoujście/Ystad")).toEqual(["swinoujscie", "ystad"]);
  });

  it("PTV pavadinimas atitinka, kai jame yra abu uostai, bet kuria tvarka", () => {
    expect(ferryMatches("Karlshamn - Klaipeda (DFDS)", "Klaipėda – Karlshamn")).toBe(true);
    expect(ferryMatches("Klaipeda - Kiel", "Klaipėda – Karlshamn")).toBe(false);
    expect(ferryMatches("Rodby - Puttgarden", "Puttgarden – Rødby")).toBe(true);
  });

  it("visi keltai su kaina – suma; bent vienas be kainos – nežinoma", () => {
    const rates = [rate("Klaipėda – Karlshamn", 52000), rate("Puttgarden – Rødby", 18000)];
    expect(contractFare(["Klaipeda - Karlshamn", "Rodby - Puttgarden"], rates)).toEqual({
      totalCents: 70000,
      lines: [{ label: "Klaipėda – Karlshamn", cents: 52000 }, { label: "Puttgarden – Rødby", cents: 18000 }],
    });
    expect(contractFare(["Klaipeda - Karlshamn", "Moss - Horten"], rates)).toBeNull();
    expect(contractFare([], rates)).toBeNull();
  });

  it("įvedimas: abu uostai ir griežta kaina eurais", () => {
    expect(parseFerryRate(" Klaipėda  –  Karlshamn ", "520,50", "")).toEqual({ ok: true, value: { label: "Klaipėda – Karlshamn", price_cents: 52050, note: null } });
    expect(parseFerryRate("Klaipėda", "520", "")).toMatchObject({ ok: false });
    expect(parseFerryRate("Klaipėda – Kiel", "0", "")).toMatchObject({ ok: false });
    expect(parseFerryRate("Klaipėda – Kiel", "52,555", "")).toMatchObject({ ok: false });
  });
});
