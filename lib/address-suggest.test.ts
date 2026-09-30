import { describe, expect, it } from "vitest";

import { parseSuggestions } from "./address-suggest";

const HAMBURGAS = { caption: "Hamburg", subCaption: "Vokietija Hamburg", searchText: "Vokietija Hamburg Hamburg" };

describe("parseSuggestions", () => {
  it("perima pavadinimą, vietą ir paieškos tekstą", () => {
    expect(parseSuggestions({ suggestions: [HAMBURGAS] })).toEqual([HAMBURGAS]);
  });

  it("praleidžia įrašus be pavadinimo arba be paieškos teksto", () => {
    const payload = {
      suggestions: [
        { caption: "", searchText: "x" },
        { caption: "Be teksto" },
        null,
        "ne objektas",
        HAMBURGAS,
      ],
    };
    expect(parseSuggestions(payload)).toEqual([HAMBURGAS]);
  });

  it("nekartoja to paties paieškos teksto", () => {
    expect(parseSuggestions({ suggestions: [HAMBURGAS, HAMBURGAS] })).toHaveLength(1);
  });

  it("apribojamas iki nurodyto kiekio", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ caption: `M${i}`, searchText: `t${i}` }));
    expect(parseSuggestions({ suggestions: many })).toHaveLength(6);
    expect(parseSuggestions({ suggestions: many }, 3)).toHaveLength(3);
  });

  it("tuščias sąrašas, jei atsakymas netinkamas", () => {
    expect(parseSuggestions(null)).toEqual([]);
    expect(parseSuggestions({})).toEqual([]);
    expect(parseSuggestions({ suggestions: "ne sąrašas" })).toEqual([]);
  });
});
