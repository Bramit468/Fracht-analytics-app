import { describe, expect, it } from "vitest";

import { todayInVilnius } from "./local-date";

describe("todayInVilnius", () => {
  it("po vidurnakčio Vilniuje jau nauja diena, nors UTC dar vakar", () => {
    // 2026-09-30 22:30 UTC = 2026-10-01 01:30 Vilniuje (vasaros laikas, UTC+3).
    const now = new Date("2026-09-30T22:30:00Z");

    expect(now.toISOString().slice(0, 10)).toBe("2026-09-30");
    expect(todayInVilnius(now)).toBe("2026-10-01");
  });

  it("žiemą skirtumas dvi valandos", () => {
    // 2026-12-31 22:30 UTC = 2027-01-01 00:30 Vilniuje (UTC+2).
    expect(todayInVilnius(new Date("2026-12-31T22:30:00Z"))).toBe("2027-01-01");
  });

  it("dienos metu sutampa su UTC", () => {
    expect(todayInVilnius(new Date("2026-10-01T12:00:00Z"))).toBe("2026-10-01");
  });
});
