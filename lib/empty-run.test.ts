import { describe, expect, it } from "vitest";

import { emptyRunShort, emptyRunStart } from "./empty-run";

const gps = { latitude: 54.9, longitude: 23.9, gpsTime: "2026-10-31 09:12:00" };

describe("emptyRunStart – tik du variantai", () => {
  it("įrašyta vieta – ji, net jei GPS yra", () => {
    expect(emptyRunStart({ address: " Kaunas ", point: "54.9,23.9" }, gps)).toEqual({ source: "manual", address: "Kaunas", point: "54.9,23.9" });
  });

  it("neįrašyta – dabartinė GPS vieta; nėra nei vieno – null", () => {
    expect(emptyRunStart(null, gps)).toEqual({ source: "gps", ...gps });
    expect(emptyRunStart({ address: "  ", point: "" }, gps)).toEqual({ source: "gps", ...gps });
    expect(emptyRunStart(null, null)).toBeNull();
  });
});

describe("emptyRunShort", () => {
  it("visada pasako, nuo ko skaičiuota", () => {
    expect(emptyRunShort({ source: "gps", ...gps }, 1234.4)).toBe("Tušti km iki pakrovimo: 1 234 km nuo furos vietos dabar (GPS, 2026-10-31 09:12).");
    expect(emptyRunShort({ source: "manual", address: "Kaunas", point: "" }, 86.4)).toBe("Tušti km iki pakrovimo: 86 km nuo įrašytos vietos Kaunas.");
  });
});
