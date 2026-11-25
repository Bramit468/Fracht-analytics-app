import { describe, expect, it } from "vitest";

import { oldTripFix } from "./old-trip-days";

const km = (days: Record<string, number>) => (date: string) => days[date];

describe("oldTripFix", () => {
  it("atima šeštadienį ir sekmadienį, kai fura stovėjo; važiavusi diena lieka", () => {
    // 2026-09-18 penktadienis, 4 paros: pn, š (0 km), s (180 km), pr.
    expect(oldTripFix("2026-09-18", 4, km({ "2026-09-18": 500, "2026-09-19": 0, "2026-09-20": 180, "2026-09-21": 450 }))).toEqual({ dates: ["2026-09-19"], days: 3 });
    expect(oldTripFix("2026-09-18", 3.5, km({ "2026-09-19": 10, "2026-09-20": 0 }))).toEqual({ dates: ["2026-09-19", "2026-09-20"], days: 1.5 });
  });

  it("nėra ką keisti, nėra ridos ar stovėjo visas laikotarpis – null", () => {
    expect(oldTripFix("2026-09-15", 2, km({ "2026-09-15": 0, "2026-09-16": 0 }))).toBeNull();
    expect(oldTripFix("2026-09-18", 3, km({}))).toBeNull();
    expect(oldTripFix("2026-09-19", 2, km({ "2026-09-19": 0, "2026-09-20": 0 }))).toBeNull();
  });
});
