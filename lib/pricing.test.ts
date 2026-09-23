import { describe, expect, it } from "vitest";

import { marginForPrice, priceForMargin, priceForProfit, pricePerKm } from "./pricing";

describe("priceForMargin", () => {
  it("marža skaičiuojama nuo pajamų, ne nuo kaštų", () => {
    // 800 € kaštų su 20 % marža yra 1000 €, o ne 960 €. Supainiojus su
    // antkainiu, kiekvienas pasiūlymas būtų per pigus, ir to nesimatytų —
    // pelnas juk vis tiek teigiamas.
    expect(priceForMargin(80000, 20)).toBe(100000);
  });

  it("nulinė marža yra kaštų kaina", () => {
    expect(priceForMargin(80000, 0)).toBe(80000);
  });

  it("neigiama marža reiškia vežimą į nuostolį", () => {
    // Pasitaiko sąmoningai: grįžtamasis reisas tuščias arba pigus.
    expect(priceForMargin(100000, -10)).toBe(90909);
  });

  it("šimtaprocentinė marža neįmanoma", () => {
    // Reikštų pajamas be kaštų. Grąžinti begalybę arba didelį skaičių būtų
    // blogiau nei pasakyti, kad atsakymo nėra.
    expect(priceForMargin(80000, 100)).toBeNull();
    expect(priceForMargin(80000, 150)).toBeNull();
  });

  it("be kaštų kainos nesiūlo", () => {
    expect(priceForMargin(0, 20)).toBeNull();
  });
});

describe("priceForProfit", () => {
  it("prideda norimą pelną prie kaštų", () => {
    expect(priceForProfit(80000, 20000)).toBe(100000);
  });
});

describe("marginForPrice", () => {
  it("grąžina maržą procentais", () => {
    expect(marginForPrice(80000, 100000)).toBeCloseTo(20, 10);
  });

  it("nuostolinga kaina duoda neigiamą maržą", () => {
    expect(marginForPrice(100000, 80000)).toBeCloseTo(-25, 10);
  });

  it("be pajamų maržos nėra", () => {
    // Nulis reikštų „dirbam be pelno", o čia tiesiog nėra iš ko skaičiuoti.
    expect(marginForPrice(80000, 0)).toBeNull();
  });
});

describe("pricePerKm", () => {
  it("kainą paverčia įkainiu už km", () => {
    expect(pricePerKm(100000, 1000)).toBeCloseTo(1, 10);
  });

  it("be kilometrų įkainio nėra", () => {
    expect(pricePerKm(100000, 0)).toBeNull();
  });
});
