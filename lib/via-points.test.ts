import { describe, expect, it } from "vitest";

import {
  addViaPoint,
  formatViaPoint,
  moveViaPoint,
  nearestLineIndex,
  orderViaPoints,
  parseViaPoints,
  removeViaPoint,
  MAX_VIA_POINTS,
} from "./via-points";
import type { LineCoordinate } from "./route-line";

const PANEVEZYS = { latitude: 55.7333, longitude: 24.35 };
const KAUNAS = { latitude: 54.8985, longitude: 23.9036 };
const VARSUVA = { latitude: 52.2297, longitude: 21.0122 };

/** Linija iš šiaurės į pietus, kaip Panevėžys → Varšuva. */
const LINE: LineCoordinate[] = [
  [24.35, 55.7333],
  [23.9036, 54.8985],
  [23.1688, 53.1325],
  [21.0122, 52.2297],
];

describe("addViaPoint", () => {
  it("prideda tašką", () => {
    const result = addViaPoint([], KAUNAS);
    expect(result.ok && result.points).toEqual([KAUNAS]);
  });

  it("to paties taško antrą kartą neprideda", () => {
    // Paspaudus beveik ton pačion vieton, PTV gautų du taškus vienoje vietoje.
    const result = addViaPoint([KAUNAS], { latitude: 54.9, longitude: 23.905 });

    expect(result.ok).toBe(false);
    expect(result.points).toEqual([KAUNAS]);
  });

  it("riboja taškų skaičių", () => {
    const daug = Array.from({ length: MAX_VIA_POINTS }, (_, index) => ({
      latitude: 50 + index,
      longitude: 20,
    }));

    const result = addViaPoint(daug, VARSUVA);
    expect(result.ok).toBe(false);
    expect(result.points).toHaveLength(MAX_VIA_POINTS);
  });
});

describe("moveViaPoint", () => {
  it("perkelia nurodytą tašką", () => {
    expect(moveViaPoint([KAUNAS, VARSUVA], 1, PANEVEZYS)).toEqual([KAUNAS, PANEVEZYS]);
  });

  it("svetimo indekso neliečia", () => {
    expect(moveViaPoint([KAUNAS], 5, VARSUVA)).toEqual([KAUNAS]);
  });
});

describe("removeViaPoint", () => {
  it("pašalina tašką", () => {
    expect(removeViaPoint([KAUNAS, VARSUVA], 0)).toEqual([VARSUVA]);
  });

  it("ištrynus paskutinį grįžtama prie pradinio maršruto", () => {
    expect(removeViaPoint([KAUNAS], 0)).toEqual([]);
  });
});

describe("nearestLineIndex", () => {
  it("randa artimiausią linijos tašką", () => {
    expect(nearestLineIndex(LINE, KAUNAS)).toBe(1);
  });

  it("tuščiai linijai grąžina nulį", () => {
    expect(nearestLineIndex([], KAUNAS)).toBe(0);
  });
});

describe("orderViaPoints", () => {
  it("rikiuoja pagal maršrutą, o ne pagal paspaudimų eilę", () => {
    // Kitaip PTV būtų verčiamas grįžti atgal į šiaurę ir vėl leistis.
    const balstoge = { latitude: 53.1325, longitude: 23.1688 };
    const ordered = orderViaPoints([balstoge, KAUNAS], LINE);

    expect(ordered).toEqual([KAUNAS, balstoge]);
  });

  it("vieno taško nejudina", () => {
    expect(orderViaPoints([KAUNAS], LINE)).toEqual([KAUNAS]);
  });

  it("be linijos palieka kaip yra", () => {
    expect(orderViaPoints([VARSUVA, KAUNAS], [])).toEqual([VARSUVA, KAUNAS]);
  });
});

describe("formatViaPoint ir parseViaPoints", () => {
  it("tekstas grįžta tuo pačiu tašku", () => {
    const text = [formatViaPoint(KAUNAS), formatViaPoint(VARSUVA)].join(";");
    const points = parseViaPoints(text);

    expect(points[0].latitude).toBeCloseTo(KAUNAS.latitude, 5);
    expect(points[1].longitude).toBeCloseTo(VARSUVA.longitude, 5);
  });

  it("šiukšles praleidžia, o ne meta klaidą", () => {
    expect(parseViaPoints("ne taskas;54.9,23.9;;999,999")).toEqual([
      { latitude: 54.9, longitude: 23.9 },
    ]);
  });

  it("tuščias tekstas duoda tuščią sąrašą", () => {
    expect(parseViaPoints("")).toEqual([]);
  });
});
