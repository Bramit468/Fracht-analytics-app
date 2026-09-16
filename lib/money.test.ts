import { describe, expect, it } from "vitest";

import { formatCents, parseEuroToCents } from "./money";

describe("parseEuroToCents", () => {
  it("sveiki eurai", () => {
    expect(parseEuroToCents("57")).toBe(5700);
    expect(parseEuroToCents("0")).toBe(0);
  });

  it("kablelis ir taškas kaip skyriklis", () => {
    expect(parseEuroToCents("57,5")).toBe(5750);
    expect(parseEuroToCents("57.50")).toBe(5750);
  });

  it("nėra float klaidos", () => {
    // 0.29 * 100 JavaScript'e yra 28.999999999999996
    expect(parseEuroToCents("0,29")).toBe(29);
    expect(parseEuroToCents("1,15")).toBe(115);
  });

  it("tarpai tarp tūkstančių ir kraštuose", () => {
    expect(parseEuroToCents(" 1 234,56 ")).toBe(123456);
    expect(parseEuroToCents("1 234")).toBe(123400);
  });

  it("atmeta blogą įvestį", () => {
    for (const bad of ["", "-5", "abc", "1,234", "1.2.3", "5 €", "1e3", ",5"]) {
      expect(parseEuroToCents(bad), bad).toBeNull();
    }
  });
});

describe("formatCents", () => {
  it("rodo eurais su dviem skaitmenimis po kablelio", () => {
    // lt-LT formatas naudoja nepertraukiamus tarpus, todėl juos suvienodinam
    expect(formatCents(26900).replace(/\s/g, " ")).toBe("269,00 €");
    expect(formatCents(123456).replace(/\s/g, " ")).toBe("1 234,56 €");
  });
});
