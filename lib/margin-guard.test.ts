import { describe, expect, it } from "vitest";

import { checkMargin, formatMinMargin, parseMinMargin, targetBelowMin } from "./margin-guard";

describe("parseMinMargin", () => {
  it("tuščia – riba nenustatyta", () => {
    expect(parseMinMargin("  ")).toEqual({ ok: true, value: null });
  });

  it("priima kablelį ir procento ženklą", () => {
    expect(parseMinMargin("12,5")).toEqual({ ok: true, value: 12.5 });
    expect(parseMinMargin("12 %")).toEqual({ ok: true, value: 12 });
  });

  it("apvalina iki šimtųjų, kaip saugo duomenų bazė", () => {
    expect(parseMinMargin("12,345")).toEqual({ ok: true, value: 12.35 });
  });

  it("atmeta neigiamą, 100 % ir ne skaičių", () => {
    expect(parseMinMargin("-1").ok).toBe(false);
    expect(parseMinMargin("100").ok).toBe(false);
    expect(parseMinMargin("dvylika").ok).toBe(false);
  });
});

describe("checkMargin", () => {
  const BASE = { totalCostCents: 80000, revenueCents: 90000 };

  it("be ribos nieko nesako", () => {
    expect(checkMargin({ ...BASE, marginPercent: 11.1, minMarginPercent: null })).toEqual({ status: "none" });
  });

  it("be pajamų lyginti nėra su kuo", () => {
    expect(checkMargin({ ...BASE, marginPercent: null, minMarginPercent: 12 })).toEqual({ status: "none" });
  });

  it("žemiau ribos – parodo kainą, kuri ją pasiektų", () => {
    // 800 € kaštų, 12 % marža: 800 / 0,88 = 909,09 €; turima 900 € – trūksta 9,09 €.
    expect(checkMargin({ ...BASE, marginPercent: 11.11, minMarginPercent: 12 })).toEqual({
      status: "below",
      minMarginPercent: 12,
      priceAtMinCents: 90909,
      shortfallCents: 909,
    });
  });

  it("lygi ribai – gerai", () => {
    expect(checkMargin({ ...BASE, marginPercent: 12, minMarginPercent: 12 })).toEqual({ status: "ok" });
  });

  it("vos žemiau dėl slankaus kablelio – gerai", () => {
    // 11,9999999 % žmogui rodoma kaip 12,0 %, todėl įspėti būtų klaidinga.
    expect(checkMargin({ ...BASE, marginPercent: 11.9999999, minMarginPercent: 12 })).toEqual({ status: "ok" });
  });

  it("nuostolingas reisas visada žemiau ribos", () => {
    const check = checkMargin({ totalCostCents: 100000, revenueCents: 90000, marginPercent: -11.1, minMarginPercent: 0 });
    expect(check.status).toBe("below");
  });
});

describe("targetBelowMin", () => {
  it("įspėja, kai norima marža mažesnė už ribą", () => {
    expect(targetBelowMin(10, 12)).toBe(true);
    expect(targetBelowMin(12, 12)).toBe(false);
    expect(targetBelowMin(15, null)).toBe(false);
  });
});

describe("formatMinMargin", () => {
  it("rodo lietuviškai", () => {
    expect(formatMinMargin(12)).toBe("12 %");
    expect(formatMinMargin(12.5)).toBe("12,5 %");
  });
});
