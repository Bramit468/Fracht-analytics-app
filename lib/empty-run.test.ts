import { describe, expect, it } from "vitest";

import { emptyRunNote, emptyRunShort, emptyRunStart, plannedUnloading, type PlannedLeg, type TruckTrip } from "./empty-run";

const gps = { latitude: 54.9, longitude: 23.9, gpsTime: "2026-10-31 09:12:00" };

function trip(overrides: Partial<TruckTrip>): TruckTrip {
  return { tripNumber: "R-1", tripDate: "2026-10-30", days: 2, destination: "Hamburg", stops: [], ...overrides };
}

describe("emptyRunStart", () => {
  it("fura dar reise – nuo jo iškrovimo, ne nuo GPS", () => {
    const stops = [
      { type: "loading", address: "Kaunas", point: "54.9,23.9" },
      { type: "unloading", address: "Hamburg, Am Hafen 1", point: "53.5,9.9" },
    ];
    expect(emptyRunStart([trip({ stops })], "2026-11-01", "2026-10-31", gps)).toEqual({
      source: "trip", tripNumber: "R-1", address: "Hamburg, Am Hafen 1", point: "53.5,9.9",
    });
  });

  it("reisas baigėsi – nuo GPS", () => {
    const done = trip({ tripDate: "2026-10-25", days: 2 });
    expect(emptyRunStart([done], "2026-11-01", "2026-10-31", gps)).toEqual({ source: "gps", ...gps });
  });

  it("paskutinė para imtinai: 1,4 paros reisas nuo vakar dar baigiasi šiandien", () => {
    const yesterday = trip({ tripDate: "2026-10-30", days: 1.4 });
    expect(emptyRunStart([yesterday], "2026-11-01", "2026-10-31", gps)?.source).toBe("trip");
    const oneDay = trip({ tripDate: "2026-10-30", days: 1 });
    expect(emptyRunStart([oneDay], "2026-11-01", "2026-10-31", gps)?.source).toBe("gps");
  });

  it("ima vėliausiai besibaigiantį reisą prieš krovinio datą", () => {
    const trips = [
      trip({ tripNumber: "A", tripDate: "2026-10-29", days: 4, destination: "Oslo" }),
      trip({ tripNumber: "B", tripDate: "2026-11-02", days: 6, destination: "Madrid" }),
      trip({ tripNumber: "C", tripDate: "2026-10-31", days: 1, destination: "Riga" }),
    ];
    // B prasideda po krovinio datos, todėl netinka; A baigiasi vėliau už C.
    expect(emptyRunStart(trips, "2026-11-01", "2026-10-31", gps)).toMatchObject({ tripNumber: "A", address: "Oslo" });
  });

  it("seni reisai be sustojimų – pagal paskirties tekstą", () => {
    expect(emptyRunStart([trip({ stops: null, destination: "Vilnius" })], "2026-11-01", "2026-10-31", null)).toEqual({
      source: "trip", tripNumber: "R-1", address: "Vilnius", point: "",
    });
  });

  it("be reiso ir be GPS – null", () => {
    expect(emptyRunStart([], "2026-11-01", "2026-10-31", null)).toBeNull();
    expect(emptyRunStart([trip({ destination: "" })], "2026-11-01", "2026-10-31", null)).toBeNull();
  });

  it("GPS – bet kuriai datai (forma įspėja, kad vieta gali keistis)", () => {
    expect(emptyRunStart([], "2026-10-31", "2026-10-31", gps)?.source).toBe("gps");
    expect(emptyRunStart([], "2026-11-01", "2026-10-31", gps)?.source).toBe("gps");
    expect(emptyRunStart([], "2026-11-12", "2026-10-31", gps)?.source).toBe("gps");
    // Žinomas nesibaigęs reisas tinka ir vėlesnei datai.
    expect(emptyRunStart([trip({ tripDate: "2026-10-31", days: 4 })], "2026-11-05", "2026-10-31", gps)?.source).toBe("trip");
  });

  it("reisai be parų praleidžiami", () => {
    expect(emptyRunStart([trip({ days: 0 })], "2026-11-01", "2026-10-31", gps)?.source).toBe("gps");
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

  it("nebaigtas iškrovimas iki krovinio dienos – vėliausias", () => {
    const legs = [leg({ end: "2026-11-02 08:00:00" }), leg({}), leg({ end: "2026-11-03 10:00:00" })];
    expect(plannedUnloading(legs, key, "OBC884", "2026-11-01 20:00:00", "2026-11-05")?.end).toBe("2026-11-04 04:00:00");
  });

  it("jau pasibaigęs, po krovinio dienos, kitos furos, ne iškrovimas, išorinis vežėjas – netinka", () => {
    const now = "2026-11-01 20:00:00";
    expect(plannedUnloading([leg({ end: "2026-11-01 10:00:00" })], key, "OBC 884", now, "2026-11-05")).toBeNull();
    expect(plannedUnloading([leg({})], key, "OBC 884", now, "2026-11-03")).toBeNull();
    expect(plannedUnloading([leg({ plate: "LOV 141" })], key, "OBC 884", now, "2026-11-05")).toBeNull();
    expect(plannedUnloading([leg({ endType: "Loading" })], key, "OBC 884", now, "2026-11-05")).toBeNull();
    expect(plannedUnloading([leg({ external: true })], key, "OBC 884", now, "2026-11-05")).toBeNull();
  });
});

describe("emptyRunNote", () => {
  it("pasako šaltinį ir pridėtas valandas", () => {
    expect(emptyRunNote({ source: "trip", tripNumber: "R-7", address: "Oslo", point: "" }, 98.456, 1.84, true)).toBe(
      "Tušti km: įrašyta 98,46 – PTV kelias nuo reiso R-7 iškrovimo (Oslo) iki pakrovimo. Į paras pridėta 1,8 val. važiavimo.",
    );
    expect(emptyRunNote({ source: "gps", ...gps }, 12, 0.25, false)).toContain("siūloma 12 – PTV kelias nuo furos GPS vietos (2026-10-31 09:12:00)");
    expect(emptyRunNote({ source: "manual", address: "Kaunas", point: "54.9,23.9" }, 100, 1.5, true)).toContain("nuo įrašytos furos vietos (Kaunas)");
  });

  it("trumpa eilutė pagrindinei skilčiai", () => {
    expect(emptyRunShort({ source: "gps", ...gps }, 1234.4)).toBe("Tušti km iki pakrovimo: 1 234 km nuo furos vietos dabar (Telematika, 2026-10-31 09:12).");
    expect(emptyRunShort({ source: "manual", address: "Kaunas", point: "" }, 86.4)).toBe("Tušti km iki pakrovimo: 86 km nuo Kaunas.");
    expect(emptyRunShort({ source: "order", address: "", point: "", city: "Boulogne-sur-Mer, FRA", end: "2026-11-04 04:00:00" }, 1200))
      .toBe("Tušti km iki pakrovimo: 1 200 km nuo užsakymo iškrovimo Boulogne-sur-Mer, FRA (11-04 04:00, Telematika).");
  });
});
