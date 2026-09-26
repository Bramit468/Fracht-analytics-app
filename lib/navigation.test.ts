import { describe, expect, it } from "vitest";

import { activeNavHref, NAV_ITEMS } from "./navigation";

describe("NAV_ITEMS", () => {
  it("apima furų puslapius", () => {
    // Būtent ten suvedama paros savikaina, o meniu jų nebuvo visai.
    const hrefs = NAV_ITEMS.map((item) => item.href);
    expect(hrefs).toContain("/trucks");
    expect(hrefs).toContain("/trucks/kastai");
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
    // `/trucks/kastai` turi pažymėti „Furų kaštus", ne „Furas".
    expect(activeNavHref("/trucks/kastai")).toBe("/trucks/kastai");
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
