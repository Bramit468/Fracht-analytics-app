import { describe, expect, it } from "vitest";

import { emptyRunNote, emptyRunStart, type TruckTrip } from "./empty-run";

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

  it("GPS – tik šiandienos ir rytojaus kroviniui; vėlesniam – istorija (null)", () => {
    expect(emptyRunStart([], "2026-10-31", "2026-10-31", gps)?.source).toBe("gps");
    expect(emptyRunStart([], "2026-11-01", "2026-10-31", gps)?.source).toBe("gps");
    expect(emptyRunStart([], "2026-11-02", "2026-10-31", gps)).toBeNull();
    // Žinomas nesibaigęs reisas tinka ir vėlesnei datai.
    expect(emptyRunStart([trip({ tripDate: "2026-10-31", days: 4 })], "2026-11-05", "2026-10-31", gps)?.source).toBe("trip");
  });

  it("reisai be parų praleidžiami", () => {
    expect(emptyRunStart([trip({ days: 0 })], "2026-11-01", "2026-10-31", gps)?.source).toBe("gps");
  });
});

describe("emptyRunNote", () => {
  it("pasako šaltinį ir pridėtas valandas", () => {
    expect(emptyRunNote({ source: "trip", tripNumber: "R-7", address: "Oslo", point: "" }, 98.456, 1.84, true)).toBe(
      "Tušti km: įrašyta 98,46 – PTV kelias nuo reiso R-7 iškrovimo (Oslo) iki pakrovimo. Į paras pridėta 1,8 val. važiavimo.",
    );
    expect(emptyRunNote({ source: "gps", ...gps }, 12, 0.25, false)).toContain("siūloma 12 – PTV kelias nuo furos GPS vietos (2026-10-31 09:12:00)");
  });
});
