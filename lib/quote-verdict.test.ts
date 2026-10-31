import { describe, expect, it } from "vitest";

import { DEFAULT_NEGOTIATION_BAND_PERCENT, parseNegotiationBand, quoteVerdict, type QuoteVerdictInput } from "./quote-verdict";

const base: QuoteVerdictInput = {
  priceCents: 100_000,
  totalCostCents: 95_000,
  contributionCents: 40_000,
  days: 2.5,
  bandPercent: 15,
  beatsAlternative: true,
};

describe("quoteVerdict", () => {
  it("Imti, kai kaina padengia savikainą", () => {
    const verdict = quoteVerdict(base);
    expect(verdict.kind).toBe("take");
    expect(verdict.approvalPossible).toBe(false);
  });

  it("Imti ir tada, kai kaina lygiai lygi savikainai", () => {
    expect(quoteVerdict({ ...base, totalCostCents: 100_000 }).kind).toBe("take");
  });

  it("Derėtis iki X: X – savikaina, suapvalinta iki eurų į viršų", () => {
    const verdict = quoteVerdict({ ...base, totalCostCents: 108_001 });
    expect(verdict.kind).toBe("negotiate");
    expect(verdict.targetPriceCents).toBe(108_100);
  });

  it("riba imtinė: lygiai +15 % – dar derėtis", () => {
    expect(quoteVerdict({ ...base, totalCostCents: 115_000 }).kind).toBe("negotiate");
  });

  it("virš ribos – neimti", () => {
    // 1 150,01 € apvalinama į 1 151 € – jau virš +15 %.
    expect(quoteVerdict({ ...base, totalCostCents: 115_001 }).kind).toBe("reject");
  });

  it("pastaba apie vadovo pritarimą – tik kai krovinys geresnis už alternatyvą", () => {
    expect(quoteVerdict({ ...base, totalCostCents: 120_000 }).approvalPossible).toBe(true);
    expect(quoteVerdict({ ...base, totalCostCents: 120_000, beatsAlternative: false }).approvalPossible).toBe(false);
  });

  it("įnašas per parą – trupmeninės paros, be dalybos iš nulio", () => {
    expect(quoteVerdict(base).contributionPerDayCents).toBe(16_000);
    expect(quoteVerdict({ ...base, days: 0 }).contributionPerDayCents).toBeNull();
    expect(quoteVerdict({ ...base, days: -1 }).contributionPerDayCents).toBeNull();
  });

  it("be kainos – neimti, procento nėra", () => {
    const verdict = quoteVerdict({ ...base, priceCents: 0 });
    expect(verdict.kind).toBe("reject");
    expect(verdict.increasePercent).toBeNull();
  });

  it("įmonės riba keičia verdiktą; be jos – numatytoji 15 %", () => {
    expect(quoteVerdict({ ...base, totalCostCents: 110_000, bandPercent: 5 }).kind).toBe("reject");
    expect(quoteVerdict({ ...base, totalCostCents: 110_000, bandPercent: null }).kind).toBe("negotiate");
    expect(quoteVerdict({ ...base, bandPercent: null }).bandPercent).toBe(DEFAULT_NEGOTIATION_BAND_PERCENT);
    expect(quoteVerdict({ ...base, bandPercent: Number.NaN }).bandPercent).toBe(15);
  });
});

describe("parseNegotiationBand", () => {
  it("tuščia – numatytoji, procentai su kableliu ir ženklu", () => {
    expect(parseNegotiationBand("")).toEqual({ ok: true, value: null });
    expect(parseNegotiationBand("12,5 %")).toEqual({ ok: true, value: 12.5 });
  });

  it("atmeta už ribų ir ne skaičius", () => {
    expect(parseNegotiationBand("-1").ok).toBe(false);
    expect(parseNegotiationBand("101").ok).toBe(false);
    expect(parseNegotiationBand("daug").ok).toBe(false);
  });
});
