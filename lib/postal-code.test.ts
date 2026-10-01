import { describe, expect, it } from "vitest";

import { normalizeAddressQuery, parsePostalQuery } from "./postal-code";

describe("parsePostalQuery", () => {
  it.each([
    ["FR-51100", "FR-51100"],
    ["fr 51100", "FR-51100"],
    ["FR51100", "FR-51100"],
    ["DE20095", "DE-20095"],
    ["51100 FR", "FR-51100"],
    ["51100, fr", "FR-51100"],
    ["PL 00-001", "PL-00-001"],
    ["GB-SW1A", "GB-SW1A"],
    ["NL 1012 ab", "NL-1012 AB"],
  ])("%s -> %s", (input, expected) => {
    expect(parsePostalQuery(input)?.normalized).toBe(expected);
  });

  it("per trumpą kodą („FR51“) pažymi kaip neišsamų", () => {
    expect(parsePostalQuery("FR51")).toMatchObject({ country: "FR", code: "51", partial: true });
    expect(parsePostalQuery("FR-511")?.partial).toBe(true);
    expect(parsePostalQuery("FR-5110")?.partial).toBe(false);
  });

  it("raidinis kodas (GB) nėra neišsamus", () => {
    expect(parsePostalQuery("GB-SW1A")?.partial).toBe(false);
  });

  it("paprasto teksto ir nežinomų šalių nelaiko pašto kodu", () => {
    for (const text of ["Vilnius", "Oslo", "Ab12", "XX-12345", "Klaipėdos g. 4", "FR", "", "Reims 51100"]) {
      expect(parsePostalQuery(text)).toBeNull();
    }
  });
});

describe("normalizeAddressQuery", () => {
  it("pašto kodą sutvarko, kitą tekstą palieka", () => {
    expect(normalizeAddressQuery("DE20095")).toBe("DE-20095");
    expect(normalizeAddressQuery("Hamburg")).toBe("Hamburg");
  });
});
