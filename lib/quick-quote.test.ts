import { describe, expect, it } from "vitest";

import { defaultEmptyKm, pickDays, quoteNotes, type QuoteNoteInput } from "./quick-quote";

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
    // Paros lauke reikia sveiko skaičiaus nuo 1; 0 ar trupmena sugadintų kaštus.
    expect(pickDays(0, 2)).toEqual({ days: 2, source: "route" });
    expect(pickDays(2.5, null)).toEqual({ days: null, source: "none" });
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

  it("nenustatytos paros prašo įrašyti ranka", () => {
    const notes = quoteNotes({ ...VISKAS_GERAI, daysSource: "none", days: null });
    expect(notes[0]).toContain("įrašykite jas ranka");
  });

  it("nulis tuščių km be istorijos nepateikiamas kaip faktas", () => {
    const notes = quoteNotes({ ...VISKAS_GERAI, emptyKm: 0, emptyShare: null });
    expect(notes[1]).toContain("istorijos nėra");
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
