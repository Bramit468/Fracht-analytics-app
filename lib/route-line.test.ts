import { describe, expect, it } from "vitest";

import { parseRouteLine, routeBounds, sharedRuns, SIMPLIFY_TOLERANCE_M, simplifyRouteLine, type LineCoordinate } from "./route-line";

describe("sharedRuns", () => {
  // Krovinio kelias rytų kryptimi palei 55° platumą.
  const loaded: LineCoordinate[] = [[24.0, 55.0], [24.5, 55.0], [25.0, 55.0]];

  it("tuščias kelias ateina iš šiaurės ir toliau eina tuo pačiu keliu – bendras tik sutampantis ruožas", () => {
    const empty: LineCoordinate[] = [[24.2, 55.5], [24.2, 55.0002], [24.6, 55.0001], [24.9, 55.0]];
    expect(sharedRuns(empty, loaded).map((run) => run.coordinates)).toEqual([[[24.2, 55.0002], [24.6, 55.0001], [24.9, 55.0]]]);
  });

  it("priešingos greitkelio juostos (~40 m) – bendra; kitas kelias (~1 km) – ne", () => {
    expect(sharedRuns([[24.1, 55.00036], [24.4, 55.00036]], loaded)).toHaveLength(1);
    expect(sharedRuns([[24.1, 55.01], [24.4, 55.01]], loaded)).toEqual([]);
  });

  it("pusė – iš kur ateina (ar kur nueina) linija, viena visam ruožui", () => {
    expect(sharedRuns([[24.2, 55.5], [24.2, 55.0], [24.6, 55.0]], loaded)[0].side).toBe(-1);
    expect(sharedRuns([[24.2, 54.5], [24.2, 55.0], [24.6, 55.0]], loaded)[0].side).toBe(1);
    expect(sharedRuns([[24.2, 55.0], [24.6, 55.0], [24.6, 55.5]], loaded)[0].side).toBe(-1);
  });

  it("trumpas tarpas (mazgas) – vienas ruožas; ilgas nuokrypis – du; per trumpa linija – nieko", () => {
    // ~100 m į šoną ~600 m ruože – užpildoma.
    const small: LineCoordinate[] = [[24.1, 55.0], [24.2, 55.0], [24.205, 55.001], [24.21, 55.0], [24.3, 55.0]];
    expect(sharedRuns(small, loaded)).toHaveLength(1);
    const detour: LineCoordinate[] = [[24.1, 55.0], [24.2, 55.0], [24.3, 55.2], [24.6, 55.0], [24.7, 55.0]];
    expect(sharedRuns(detour, loaded).map((run) => run.coordinates)).toEqual([[[24.1, 55.0], [24.2, 55.0]], [[24.6, 55.0], [24.7, 55.0]]]);
    expect(sharedRuns([[24.1, 55.0]], loaded)).toEqual([]);
  });
});

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

describe("simplifyRouteLine", () => {
  // Tiesus ruožas su vienu aštriu posūkiu viduryje.
  const kampas: LineCoordinate[] = [
    ...Array.from({ length: 1000 }, (_, i): LineCoordinate => [24 + i * 0.001, 55]),
    ...Array.from({ length: 1000 }, (_, i): LineCoordinate => [25, 55 + i * 0.001]),
  ];

  it("išmeta tiesius ruožus, bet palieka posūkį", () => {
    const paprasta = simplifyRouteLine(kampas);
    expect(paprasta.length).toBeLessThan(10);
    expect(paprasta).toContainEqual([25, 55]);
  });

  it("neperpjauna kreivės: nuokrypis neviršija tolerancijos", () => {
    const lanka: LineCoordinate[] = Array.from({ length: 3000 }, (_, i) => [24 + i * 0.0005, 55 + Math.sin(i / 90) * 0.1]);
    const paprasta = simplifyRouteLine(lanka);
    expect(paprasta.length).toBeLessThan(lanka.length);

    const k = Math.cos((55 * Math.PI) / 180) * 111_320;
    const toSegment = (p: LineCoordinate, a: LineCoordinate, b: LineCoordinate) => {
      const [px, py, ax, ay, bx, by] = [p[0] * k, p[1] * 111_320, a[0] * k, a[1] * 111_320, b[0] * k, b[1] * 111_320];
      const l = (bx - ax) ** 2 + (by - ay) ** 2;
      const u = l === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l));
      return Math.hypot(px - (ax + u * (bx - ax)), py - (ay + u * (by - ay)));
    };
    for (const p of lanka) {
      const arciausias = Math.min(...paprasta.slice(1).map((b, i) => toSegment(p, paprasta[i], b)));
      // Tolerancija plius apvalinimas iki ~1 m.
      expect(arciausias).toBeLessThan(SIMPLIFY_TOLERANCE_M + 1.5);
    }
  });

  it("pradžia ir pabaiga išlieka", () => {
    // Be jų linija nutrūktų prieš pasiekiant adresą, ir atrodytų, kad
    // maršrutas skaičiuotas ne ten.
    const paprasta = simplifyRouteLine(kampas);
    expect(paprasta[0]).toEqual(kampas[0]);
    expect(paprasta[paprasta.length - 1]).toEqual(kampas[kampas.length - 1]);
  });

  it("trumpos linijos neprarandamos, tik suapvalinamos", () => {
    expect(simplifyRouteLine([[1.123456789, 2], [3, 4]])).toEqual([[1.12346, 2], [3, 4]]);
    expect(simplifyRouteLine([])).toEqual([]);
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
