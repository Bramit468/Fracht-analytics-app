import { describe, expect, it } from "vitest";

import type { RouteViolation } from "./ptv-route";
import { groupViolations, violationPlace } from "./route-violations";

function violation(distanceKm: number, message = "Apribojimas."): RouteViolation {
  return { type: "x", message, distanceKm, temporary: false, timeRestricted: false };
}

describe("violationPlace", () => {
  it("prie pradžios – pakrovimo vieta", () => {
    expect(violationPlace(0, 472)).toBe("start");
    expect(violationPlace(15, 472)).toBe("start");
  });

  it("prie pabaigos – iškrovimo vieta", () => {
    // Paryžius–Londonas: 472 km, pažeidimai ties 464 ir 469 km.
    expect(violationPlace(464.2, 472)).toBe("end");
    expect(violationPlace(468.9, 472)).toBe("end");
  });

  it("viduryje – maršrutas", () => {
    expect(violationPlace(200, 472)).toBe("route");
  });

  it("nežinant ilgio pabaigos nespėja", () => {
    expect(violationPlace(468.9, null)).toBe("route");
  });
});

describe("groupViolations", () => {
  it("sugrupuoja ir išlaiko tvarką: pradžia, pabaiga, maršrutas", () => {
    const groups = groupViolations([violation(300), violation(469), violation(2), violation(464)], 472);

    expect(groups.map((group) => [group.place, group.violations.length])).toEqual([
      ["start", 1],
      ["end", 2],
      ["route", 1],
    ]);
  });

  it("be pažeidimų – tuščia", () => {
    expect(groupViolations([], 472)).toEqual([]);
  });
});
