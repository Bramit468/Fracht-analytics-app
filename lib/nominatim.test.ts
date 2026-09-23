import { describe, expect, it } from "vitest";

import { addressLabel, parseNominatim } from "./nominatim";

/** Sutrumpintos tikrų atsakymų kopijos su `accept-language=lt`. */
const ATSAKYMAS = [
  {
    lat: "55.7275581",
    lon: "24.3461894",
    display_name: "45, Klaipėdos g., Senamiestis, Panevėžys, Panevėžio miesto savivaldybė, Panevėžio apskritis, 35217, Lietuva",
  },
  {
    lat: "59.9133301",
    lon: "10.7389701",
    display_name: "Oslas, Norvegija",
  },
];

describe("parseNominatim", () => {
  it("koordinates paverčia skaičiais", () => {
    // Nominatim jas siunčia tekstu. Pražiūrėjus, maršrutas gautų NaN ir
    // nulūžtų be jokio paaiškinimo.
    const [pirmas] = parseNominatim(ATSAKYMAS);

    expect(pirmas.latitude).toBeCloseTo(55.7275581, 6);
    expect(pirmas.longitude).toBeCloseTo(24.3461894, 6);
  });

  it("ilgą adresą skaido į pavadinimą ir likusią dalį", () => {
    const [pirmas] = parseNominatim(ATSAKYMAS);

    expect(pirmas.label).toBe("45, Klaipėdos g., Senamiestis");
    expect(pirmas.sublabel).toBe("Panevėžys, Panevėžio miesto savivaldybė, Panevėžio apskritis, 35217, Lietuva");
  });

  it("trumpas adresas lieka be antros dalies", () => {
    const [, antras] = parseNominatim(ATSAKYMAS);

    expect(antras.label).toBe("Oslas, Norvegija");
    expect(antras.sublabel).toBe("");
  });

  it("praleidžia eilutes be koordinačių ar pavadinimo", () => {
    expect(parseNominatim([{ display_name: "be taško" }])).toEqual([]);
    expect(parseNominatim([{ lat: "55", lon: "24" }])).toEqual([]);
    expect(parseNominatim([{ lat: "ne skaičius", lon: "24", display_name: "x" }])).toEqual([]);
  });

  it("to paties adreso nekartoja", () => {
    expect(parseNominatim([ATSAKYMAS[1], ATSAKYMAS[1]])).toHaveLength(1);
  });

  it("riboja sąrašo ilgį", () => {
    expect(parseNominatim(ATSAKYMAS, 1)).toHaveLength(1);
  });

  it("netinkamas atsakymas duoda tuščią sąrašą", () => {
    expect(parseNominatim({})).toEqual([]);
    expect(parseNominatim(null)).toEqual([]);
  });
});

describe("addressLabel", () => {
  it("sujungia abi dalis", () => {
    const [pirmas] = parseNominatim(ATSAKYMAS);
    expect(addressLabel(pirmas)).toBe(
      "45, Klaipėdos g., Senamiestis, Panevėžys, Panevėžio miesto savivaldybė, Panevėžio apskritis, 35217, Lietuva",
    );
  });

  it("be antros dalies palieka vien pavadinimą", () => {
    const [, antras] = parseNominatim(ATSAKYMAS);
    expect(addressLabel(antras)).toBe("Oslas, Norvegija");
  });
});
