import { describe, expect, it } from "vitest";

import { activeNavHref, NAV_ITEMS } from "./navigation";

describe("NAV_ITEMS", () => {
  it("furos – vienas punktas", () => {
    // Kaštai ir svoriai yra furų puslapio skirtukai, ne atskiri punktai (#169).
    const hrefs = NAV_ITEMS.map((item) => item.href);
    expect(hrefs).toContain("/trucks");
    expect(hrefs.filter((href) => href.startsWith("/trucks"))).toEqual(["/trucks"]);
  });

  it("kiekvienas punktas turi pavadinimą", () => {
    for (const item of NAV_ITEMS) {
      expect(item.label).toBeTruthy();
    }
  });
});

describe("activeNavHref", () => {
  it("pažymi tikslų puslapį", () => {
    expect(activeNavHref("/trips")).toBe("/trips");
  });

  it("ima ilgiausią tinkantį adresą", () => {
    // `/trips/new` turi pažymėti „Naują reisą", ne „Reisus".
    expect(activeNavHref("/trips/new")).toBe("/trips/new");
  });

  it("vidinį puslapį priskiria savo skilčiai", () => {
    expect(activeNavHref("/trucks/abc-123/edit")).toBe("/trucks");
    expect(activeNavHref("/trips/abc-123/edit")).toBe("/trips");
  });

  it("pagrindinį puslapį lygina tiksliai", () => {
    // Kitaip „/" būtų pažymėtas visur.
    expect(activeNavHref("/")).toBe("/");
    expect(activeNavHref("/telematika")).toBe("/telematika");
  });

  it("nepaiso pabaigos brūkšnio", () => {
    expect(activeNavHref("/trips/")).toBe("/trips");
  });

  it("nežinomam adresui nieko nepažymi", () => {
    expect(activeNavHref("/nera-tokio")).toBeNull();
  });
});
