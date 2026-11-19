import { describe, expect, it } from "vitest";

import { emptyRunShort, emptyRunStart, plannedUnloading, type PlannedLeg } from "./empty-run";

const gps = { latitude: 54.9, longitude: 23.9, gpsTime: "2026-10-31 09:12:00" };
const order = { source: "order" as const, address: "Rue Léon CALON 3, 62200 Boulogne-sur-Mer, FRA", point: "", city: "Boulogne-sur-Mer, FRA", end: "2026-11-04 04:00:00" };

describe("emptyRunStart", () => {
  it("suplanuotas iškrovimas – jis, net jei GPS yra", () => {
    expect(emptyRunStart(order, gps)).toEqual(order);
  });

  it("be iškrovimo – GPS; nėra nei vieno – null", () => {
    expect(emptyRunStart(null, gps)).toEqual({ source: "gps", ...gps });
    expect(emptyRunStart(null, null)).toBeNull();
  });
});

describe("plannedUnloading", () => {
  const key = (plate: string) => plate.replace(/\s+/g, "").toUpperCase();
  const leg = (over: Partial<PlannedLeg>): PlannedLeg => ({
    plate: "OBC 884",
    end: "2026-11-04 04:00:00",
    endPlace: "Marine Harvest Boulogne, FRA, Boulogne-sur-Mer, 62200, Rue Léon CALON 3",
    endType: "Unloading",
    external: false,
    ...over,
  });
  const now = "2026-11-01 20:00:00";

  it("vėliausias neįvykęs iškrovimas iki krovinio dienos", () => {
    const legs = [leg({ end: "2026-11-02 08:00:00" }), leg({}), leg({ end: "2026-11-03 10:00:00" })];
    expect(plannedUnloading(legs, key, "OBC884", now, "2026-11-05")?.end).toBe("2026-11-04 04:00:00");
    // Vėlesnis už krovinio dieną – fura tada dar užimta.
    expect(plannedUnloading(legs, key, "OBC884", now, "2026-11-03")?.end).toBe("2026-11-03 10:00:00");
  });

  it("be datos – paskutinis suplanuotas", () => {
    expect(plannedUnloading([leg({ end: "2026-11-09 08:00:00" }), leg({})], key, "OBC 884", now, "")?.end).toBe("2026-11-09 08:00:00");
  });

  it("jau įvykęs, kitos furos, ne iškrovimas, išorinis vežėjas – netinka", () => {
    expect(plannedUnloading([leg({ end: "2026-11-01 10:00:00" })], key, "OBC 884", now, "2026-11-05")).toBeNull();
    expect(plannedUnloading([leg({ plate: "LOV 141" })], key, "OBC 884", now, "2026-11-05")).toBeNull();
    expect(plannedUnloading([leg({ endType: "Loading" })], key, "OBC 884", now, "2026-11-05")).toBeNull();
    expect(plannedUnloading([leg({ external: true })], key, "OBC 884", now, "2026-11-05")).toBeNull();
  });
});

describe("emptyRunShort", () => {
  it("visada pasako, nuo ko skaičiuota", () => {
    expect(emptyRunShort({ source: "gps", ...gps }, 1234.4)).toBe("Tušti km iki pakrovimo: 1 234 km nuo furos vietos dabar (GPS, 2026-10-31 09:12).");
    expect(emptyRunShort(order, 1200)).toBe("Tušti km iki pakrovimo: 1 200 km nuo suplanuoto iškrovimo Boulogne-sur-Mer, FRA (11-04 04:00, Telematika).");
  });
});
