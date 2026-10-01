import { describe, expect, it } from "vitest";

import { parseTruckTab, truckTabHref } from "./truck-tabs";

describe("parseTruckTab", () => {
  it("atpažįsta skirtukus", () => {
    expect(parseTruckTab("kastai")).toBe("kastai");
    expect(parseTruckTab("svoriai")).toBe("svoriai");
  });

  it("be skirtuko ar su nežinomu – sąrašas", () => {
    expect(parseTruckTab(undefined)).toBe("sarasas");
    expect(parseTruckTab("bet kas")).toBe("sarasas");
  });

  it("pasikartojus parametrui ima pirmą", () => {
    expect(parseTruckTab(["kastai", "svoriai"])).toBe("kastai");
  });
});

describe("truckTabHref", () => {
  it("sąrašas – švarus adresas, kiti su parametru", () => {
    expect(truckTabHref("sarasas")).toBe("/trucks");
    expect(truckTabHref("kastai")).toBe("/trucks?skiltis=kastai");
  });

  it("adresas grįžta į tą patį skirtuką", () => {
    for (const tab of ["sarasas", "kastai", "svoriai"] as const) {
      const href = truckTabHref(tab);
      const value = new URL(href, "https://x").searchParams.get("skiltis") ?? undefined;
      expect(parseTruckTab(value)).toBe(tab);
    }
  });
});
