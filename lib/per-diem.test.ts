import { describe, expect, it } from "vitest";

import { countriesByDay, countriesByDayFromStops, fitPerDiemDays, parsePerDiemPercent, perDiemCentsFor, perDiemDays } from "./per-diem";
import { iso2FromIso3, PER_DIEM_NORMS_EUR, perDiemNormCents } from "./per-diem-norms";

/** Tikras PTV tvarkaraštis Panevėžys–Roterdamas, išvykstant 2026-10-12 06:00 (patikrinta 2026-10-10). */
const PANEVEZYS_ROTTERDAM = {
  startTime: "2026-10-12T06:00:00+03:00",
  endTime: "2026-10-14T06:35:41+03:00",
  startCountry: "LT",
  borders: [
    { startsAt: "2026-10-12T08:41:08+03:00", countryCode: "PL" },
    { startsAt: "2026-10-13T06:51:16+03:00", countryCode: "DE" },
    { startsAt: "2026-10-14T02:21:34+03:00", countryCode: "NL" },
  ],
};

describe("perDiemNormCents", () => {
  it("oficialios normos nuo 2026-10-01", () => {
    expect(perDiemNormCents("PL")).toBe(4800);
    expect(perDiemNormCents("de")).toBe(6200);
    expect(perDiemNormCents("NL")).toBe(6400);
    expect(perDiemNormCents("LT")).toBe(2800);
  });

  it("nežinomos šalies nespėja", () => {
    expect(perDiemNormCents("US")).toBeNull();
  });
});

describe("countriesByDay", () => {
  it("kiekvienai dienai – kur fura buvo", () => {
    expect(countriesByDay(PANEVEZYS_ROTTERDAM)).toEqual([
      ["LT", "PL"],
      ["PL", "DE"],
      ["DE", "NL"],
    ]);
  });

  it("be sienų – visos dienos vienoje šalyje", () => {
    expect(countriesByDay({ ...PANEVEZYS_ROTTERDAM, borders: [], endTime: "2026-10-13T10:00:00+03:00" })).toEqual([
      ["LT"],
      ["LT"],
    ]);
  });

  it("sugadintos datos – tuščia", () => {
    expect(countriesByDay({ ...PANEVEZYS_ROTTERDAM, endTime: "" })).toEqual([]);
  });
});

describe("perDiemDays", () => {
  it("Panevėžys–Roterdamas: PL, PL/DE vidurkis, DE/NL vidurkis", () => {
    const result = perDiemDays(countriesByDay(PANEVEZYS_ROTTERDAM), 100);

    // 1 d.: išvykimo diena – Lietuva neskaičiuojama, Lenkija 48 €.
    // 2 d.: (48 + 62) / 2 = 55 €. 3 d.: (62 + 64) / 2 = 63 €.
    expect(result.days).toEqual([
      { countries: ["PL"], cents: 4800 },
      { countries: ["PL", "DE"], cents: 5500 },
      { countries: ["DE", "NL"], cents: 6300 },
    ]);
    expect(result.totalCents).toBe(16600);
    expect(result.unknownCountries).toEqual([]);
  });

  it("taiko įmonės procentą kiekvienai dienai", () => {
    expect(perDiemDays([["PL"], ["DE"]], 50).totalCents).toBe(2400 + 3100);
  });

  it("trijų šalių vidurkį apvalina iki cento", () => {
    // (48 + 62 + 44) / 3 = 51,333 € → 5133 ct.
    expect(perDiemDays([["PL", "DE", "LV"]], 100).days[0].cents).toBe(5133);
  });

  it("išvykimo diena vien Lietuvoje – pagal šalį, į kurią vykstama", () => {
    expect(perDiemDays([["LT"], ["LT", "LV"], ["LV"]], 100).days[0]).toEqual({ countries: ["LV"], cents: 4400 });
  });

  it("grįžimo diena vien Lietuvoje – pagal šalį, iš kurios grįžtama", () => {
    expect(perDiemDays([["PL"], ["PL", "LT"], ["LT"]], 100).days.map((day) => day.countries)).toEqual([
      ["PL"],
      ["PL"],
      ["PL"],
    ]);
  });

  it("kelių dienų reisas Lietuvoje – Lietuvos norma", () => {
    expect(perDiemDays([["LT"], ["LT"]], 100).totalCents).toBe(5600);
  });

  it("vienos dienos reisas Lietuvoje dienpinigių neturi", () => {
    expect(perDiemDays([["LT"]], 100).totalCents).toBe(0);
  });

  it("nežinomą šalį praneša, o ne skaičiuoja kaip 0 €", () => {
    expect(perDiemDays([["PL", "US"]], 100).unknownCountries).toEqual(["US"]);
  });
});

describe("fitPerDiemDays", () => {
  const DAYS = [
    { countries: ["PL"], cents: 4800 },
    { countries: ["PL", "DE"], cents: 5500 },
    { countries: ["DE", "NL"], cents: 6300 },
  ];

  it("ilgesnis reisas – papildomos dienos kaip paskutinė", () => {
    expect(fitPerDiemDays(DAYS, 5).map((day) => day.cents)).toEqual([4800, 5500, 6300, 6300, 6300]);
  });

  it("trumpesnis – paskirties diena lieka", () => {
    expect(fitPerDiemDays(DAYS, 2).map((day) => day.cents)).toEqual([4800, 6300]);
  });

  it("tiek pat – nekeičia", () => {
    expect(fitPerDiemDays(DAYS, 3)).toBe(DAYS);
  });
});

describe("parsePerDiemPercent", () => {
  it("tuščias – išjungta", () => {
    expect(parsePerDiemPercent("")).toEqual({ ok: true, value: null });
  });

  it("50–100 %", () => {
    expect(parsePerDiemPercent("100")).toEqual({ ok: true, value: 100 });
    expect(parsePerDiemPercent("65 %")).toEqual({ ok: true, value: 65 });
    expect(parsePerDiemPercent("49").ok).toBe(false);
    expect(parsePerDiemPercent("101").ok).toBe(false);
  });
});

describe("iso2FromIso3", () => {
  it("maps every norm country and nothing unknown", () => {
    expect(iso2FromIso3("swe")).toBe("SE");
    expect(iso2FromIso3("DEU")).toBe("DE");
    expect(iso2FromIso3("USA")).toBeNull();
    // Kiekviena normų šalis turi trijų raidžių atitikmenį.
    const mapped = ["AND","ALB","AUT","BIH","BEL","BGR","BLR","CHE","CYP","CZE","DEU","DNK","EST","ESP","FIN","FRA","GBR","GRC","HRV","HUN","IRL","ISL","ITA","LIE","LTU","LUX","LVA","MCO","MDA","MNE","MKD","MLT","NLD","NOR","POL","PRT","ROU","SRB","RUS","SWE","SVN","SVK","SMR","TUR","UKR","VAT","XKX","ARM","AZE","GEO","KGZ","KAZ","MNG","TJK","TKM","UZB","CHN","AFG","PAK","ARE","BHR","ISR","IRQ","IRN","JOR","KWT","LBN","OMN","QAT","SAU","SYR","YEM","DZA","EGY","LBY","MAR","TUN"].map(iso2FromIso3);
    expect(new Set(mapped)).toEqual(new Set(Object.keys(PER_DIEM_NORMS_EUR)));
  });
});

describe("countriesByDayFromStops", () => {
  it("fills days without stops with travel toward the next stop", () => {
    expect(countriesByDayFromStops([
      { at: "2026-10-01 08:00:00", country: "LT" },
      { at: "2026-10-01 10:00:00", country: "LT" },
      { at: "2026-10-03 14:00:00", country: "DE" },
      { at: "2026-10-04 09:00:00", country: "NL" },
    ])).toEqual([["LT", "DE"], ["LT", "DE"], ["LT", "DE"], ["DE", "NL"]]);
  });

  it("returns nothing for no stops or a bad date", () => {
    expect(countriesByDayFromStops([])).toEqual([]);
    expect(countriesByDayFromStops([{ at: "vakar", country: "LT" }])).toEqual([]);
  });
});

describe("perDiemCentsFor", () => {
  const days = [{ countries: ["DE"], cents: 6200 }, { countries: ["NL"], cents: 6400 }, { countries: ["NL"], cents: 6400 }];
  it("is the plain sum for whole days and pro rata for fractional ones", () => {
    expect(perDiemCentsFor(days, 3)).toBe(19_000);
    expect(perDiemCentsFor(days, 2.375)).toBe(Math.round((19_000 * 2.375) / 3));
    expect(perDiemCentsFor([], 2)).toBe(0);
  });
});
