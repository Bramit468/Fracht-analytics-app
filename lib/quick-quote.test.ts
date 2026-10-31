import { describe, expect, it } from "vitest";

import { defaultEmptyKm, emptyKmTollCents, hoursBetween, pickDays, quoteDays, quoteNotes, serviceHours, type QuoteNoteInput } from "./quick-quote";

describe("pickDays", () => {
  it("pirmenybė vairavimo laiko planui", () => {
    expect(pickDays(3, 2)).toEqual({ days: 3, source: "schedule" });
  });

  it("be plano imamas maršruto spėjimas", () => {
    expect(pickDays(null, 2)).toEqual({ days: 2, source: "route" });
  });

  it("be abiejų parų nerašo – geriau tuščias laukas nei išgalvotas skaičius", () => {
    expect(pickDays(null, null)).toEqual({ days: null, source: "none" });
  });

  it("netinkamo skaičiaus nepriima", () => {
    // 0 parų reikštų, kad fura nieko nekainavo. Trupmena tinka: 2,5 paros nėra 3.
    expect(pickDays(0, 2)).toEqual({ days: 2, source: "route" });
    expect(pickDays(2.5, null)).toEqual({ days: 2.5, source: "schedule" });
    expect(pickDays(Number.NaN, 1)).toEqual({ days: 1, source: "route" });
  });
});

describe("defaultEmptyKm", () => {
  it("dalis skaičiuojama nuo visos ridos, ne nuo apmokamos", () => {
    // 20 % tuščia reiškia: iš 1250 km 250 tuščių, o apmokami – 1000.
    expect(defaultEmptyKm(1000, 20)).toBe(250);
  });

  it("apvalina iki šimtosios", () => {
    // 1000 × 33 / 67 = 492,537…
    expect(defaultEmptyKm(1000, 33)).toBe(492.54);
  });

  it("be istorijos – nulis", () => {
    expect(defaultEmptyKm(1000, null)).toBe(0);
  });

  it("neįmanoma dalis neduoda begalybės", () => {
    // 100 % reikštų dalybą iš nulio.
    expect(defaultEmptyKm(1000, 100)).toBe(0);
    expect(defaultEmptyKm(1000, 150)).toBe(0);
    expect(defaultEmptyKm(1000, 0)).toBe(0);
    expect(defaultEmptyKm(1000, -5)).toBe(0);
  });

  it("be apmokamų km tuščių nėra", () => {
    expect(defaultEmptyKm(0, 20)).toBe(0);
    expect(defaultEmptyKm(Number.NaN, 20)).toBe(0);
  });
});

const VISKAS_GERAI: QuoteNoteInput = {
  applied: true,
  routeOk: true,
  scheduleOk: true,
  days: 3,
  daysSource: "schedule",
  emptyKm: 250,
  emptyShare: 20,
  ferryUnknown: false,
  approximateAddress: false,
};

describe("quoteNotes", () => {
  it("pasako, iš ko paimtos paros ir tušti km", () => {
    const notes = quoteNotes(VISKAS_GERAI);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain("PTV vairavimo laiko planą");
    expect(notes[1]).toContain("250");
    expect(notes[1]).toContain("20 %");
  });

  it("paros pagal maršruto spėjimą pažymimos kaip apytikslės", () => {
    const notes = quoteNotes({ ...VISKAS_GERAI, daysSource: "route", days: 2, scheduleOk: false });
    expect(notes[0]).toContain("apytikslis");
    expect(notes[0]).toContain("plano gauti nepavyko");
  });

  it("be reiso datos nesako, kad planas nepavyko", () => {
    const notes = quoteNotes({ ...VISKAS_GERAI, daysSource: "route", days: 2, scheduleOk: false, noDeparture: true });
    expect(notes[0]).toContain("neįvesta reiso data");
    expect(notes[0]).not.toContain("nepavyko");
  });

  it("nenustatytos paros prašo įrašyti ranka", () => {
    const notes = quoteNotes({ ...VISKAS_GERAI, daysSource: "none", days: null });
    expect(notes[0]).toContain("įrašykite jas ranka");
  });

  it("nulis tuščių km be istorijos nepateikiamas kaip faktas", () => {
    const notes = quoteNotes({ ...VISKAS_GERAI, emptyKm: 0, emptyShare: null });
    expect(notes[1]).toContain("istorijos nėra");
  });

  it("tikras kelias iki pakrovimo nustelbia istoriją", () => {
    const notes = quoteNotes({ ...VISKAS_GERAI, emptyRunNote: "Tušti km: įrašyta 98 – PTV kelias…" });
    expect(notes).toContain("Tušti km: įrašyta 98 – PTV kelias…");
    expect(notes.join(" ")).not.toContain("istoriją");
  });

  it("įspėja apie nežinomą kelto kainą, apytikslį adresą ir nepavykusį maršrutą", () => {
    const text = quoteNotes({
      ...VISKAS_GERAI,
      routeOk: false,
      ferryUnknown: true,
      approximateAddress: true,
    }).join(" ");
    expect(text).toContain("Maršruto suskaičiuoti nepavyko");
    expect(text).toContain("Kelto bilieto kaina nežinoma");
    expect(text).toContain("tik iki miesto");
  });

  it("redaguojant išsaugotą reisą viskas tik siūloma", () => {
    const notes = quoteNotes({ ...VISKAS_GERAI, applied: false });
    expect(notes[0]).toContain("laukai nepakeisti");
    expect(notes.join(" ")).toContain("siūloma");
    expect(notes.join(" ")).not.toContain("įrašyta");
  });
});

describe("paros trupmenomis su pakrovimu ir iškrovimu", () => {
  it("PTV laikai virsta valandomis su laiko juosta", () => {
    expect(hoursBetween("2026-09-28T06:00:00+02:00", "2026-09-30T23:28:00+02:00")).toBeCloseTo(65.47, 2);
    expect(hoursBetween("ne data", "2026-09-30T23:28:00+02:00")).toBeNull();
    expect(hoursBetween("2026-09-30T00:00:00Z", "2026-09-29T00:00:00Z")).toBeNull();
  });

  it("pakrovimo ir iškrovimo valandos – tik krovimo sustojimams", () => {
    expect(serviceHours(["loading", "customs", "extra_unloading", "unloading"], 2)).toBe(6);
    expect(serviceHours(["loading", "unloading"], 1.5)).toBe(3);
    expect(serviceHours(["loading", "unloading"], Number.NaN)).toBe(0);
  });

  it("paros = kelias + sustojimai / 24, neapvalinant į sveikas", () => {
    // 65,47 val. kelio + 2 × 2 val. = 69,47 val. = 2,89 paros, ne 3.
    expect(quoteDays(65.47 / 24, 4)).toBe(2.89);
    expect(quoteDays(2, 0)).toBe(2);
    expect(quoteDays(0, 4)).toBe(0.17);
    expect(quoteDays(null, 4)).toBeNull();
    expect(quoteDays(0, 0)).toBeNull();
  });
});

describe("emptyKmTollCents", () => {
  it("tuštiems km – pakrauto maršruto vidurkis €/km", () => {
    // 300 € už 1000 km, 250 tuščių km -> 75 €.
    expect(emptyKmTollCents(30000, 1000, 250)).toBe(7500);
  });

  it("be km ar be mokesčių – nulis, ne NaN", () => {
    expect(emptyKmTollCents(30000, 0, 250)).toBe(0);
    expect(emptyKmTollCents(30000, 1000, 0)).toBe(0);
    expect(emptyKmTollCents(0, 1000, 250)).toBe(0);
  });
});

describe("quoteNotes: kuro kaina pagal maršrutą", () => {
  const base: QuoteNoteInput = {
    applied: true, routeOk: true, scheduleOk: true, days: 2.18, daysSource: "schedule",
    emptyKm: 0, emptyShare: null, ferryUnknown: false, approximateAddress: false,
  };

  it("parodo šalis ir kurios kainos – įmonės vidurkis", () => {
    const notes = quoteNotes({ ...base, routeFuel: { pricePerL: 1.5612, rows: [
      { countryCode: "LT", km: 271.93, pricePerL: 1.571, fleetAverage: true },
      { countryCode: "PL", km: 776.12, pricePerL: 1.554, fleetAverage: false },
    ] } });
    expect(notes).toContain("Kuro kaina: įrašyta 1,561 €/l – pagal maršruto šalis: LT 272 km 1,571 (įmonės vidurkis), PL 776 km 1,554.");
  });

  it("nepavykus – sako, kad liko furos kaina", () => {
    expect(quoteNotes({ ...base, routeFuel: null })).toContain("Kuro kaina – furos praėjusių 30 d., nes maršruto šalių kainų gauti nepavyko.");
  });

  it("be maršruto – nieko apie kurą nesako", () => {
    expect(quoteNotes(base).some((note) => note.startsWith("Kuro kaina"))).toBe(false);
  });
});
