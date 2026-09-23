import { describe, expect, it } from "vitest";

import { parseRouteLine, routeBounds, thinRouteLine, type LineCoordinate } from "./route-line";

/** Sutrumpinta tikro PTV atsakymo kopija: laukas ateina tekstu. */
const POLYLINE = JSON.stringify({
  type: "LineString",
  coordinates: [
    [24.346242687, 55.727768266],
    [24.345696615, 55.727812223],
    [24.343663712, 55.727982722],
  ],
});

describe("parseRouteLine", () => {
  it("nuskaito koordinates iš teksto", () => {
    // PTV siunčia JSON viduje teksto, nors visas atsakymas ir taip JSON.
    expect(parseRouteLine(POLYLINE)).toEqual([
      [24.346242687, 55.727768266],
      [24.345696615, 55.727812223],
      [24.343663712, 55.727982722],
    ]);
  });

  it("sugadintas tekstas duoda tuščią liniją, o ne klaidą", () => {
    // Be linijos žemėlapis lieka tuščias, bet reisas suskaičiuojamas.
    expect(parseRouteLine("{ne json")).toEqual([]);
    expect(parseRouteLine("")).toEqual([]);
    expect(parseRouteLine(null)).toEqual([]);
    expect(parseRouteLine(JSON.stringify({ type: "LineString" }))).toEqual([]);
  });

  it("praleidžia netinkamus taškus", () => {
    const sugadintas = JSON.stringify({ coordinates: [[1, 2], ["a", 2], [3], [4, 5]] });
    expect(parseRouteLine(sugadintas)).toEqual([[1, 2], [4, 5]]);
  });
});

describe("thinRouteLine", () => {
  const ilga: LineCoordinate[] = Array.from({ length: 5000 }, (_, i) => [i / 1000, 50 + i / 1000]);

  it("sutrumpina iki ribos", () => {
    expect(thinRouteLine(ilga, 400).length).toBeLessThanOrEqual(400);
  });

  it("pradžia ir pabaiga išlieka", () => {
    // Be jų linija nutrūktų prieš pasiekiant adresą, ir atrodytų, kad
    // maršrutas skaičiuotas ne ten.
    const trumpinta = thinRouteLine(ilga, 400);

    expect(trumpinta[0]).toEqual(ilga[0]);
    expect(trumpinta[trumpinta.length - 1]).toEqual(ilga[ilga.length - 1]);
  });

  it("trumpos linijos neliečia", () => {
    const trumpa: LineCoordinate[] = [[1, 1], [2, 2], [3, 3]];
    expect(thinRouteLine(trumpa, 400)).toBe(trumpa);
  });
});

describe("routeBounds", () => {
  it("randa kraštines", () => {
    expect(routeBounds([[24.3, 55.7], [10.7, 59.9], [18.0, 57.0]])).toEqual([
      [10.7, 55.7],
      [24.3, 59.9],
    ]);
  });

  it("tuščia linija kraštinių neturi", () => {
    expect(routeBounds([])).toBeNull();
  });
});
