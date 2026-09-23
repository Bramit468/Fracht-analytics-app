import { describe, expect, it } from "vitest";

import { parsePhotonPlaces, placeLabel } from "./photon";

/** Sutrumpinta tikro atsakymo kopija: „Klaipėdos g. 45 Panevėžys“. */
const ATSAKYMAS = {
  features: [
    {
      geometry: { coordinates: [24.3462, 55.7276] },
      properties: {
        name: "45", housenumber: "45", street: "Klaipėdos gatvė",
        city: "Panevėžys", postcode: "35217", country: "Lietuva",
      },
    },
    {
      geometry: { coordinates: [21.8721, 55.1372] },
      properties: { name: "Klaipėdos g.", street: "Klaipėdos g.", city: "Pagėgiai", country: "Lietuva" },
    },
    {
      // Ta pati gatvė antru OSM įrašu – sąraše ji neatskiriama.
      geometry: { coordinates: [21.8722, 55.1373] },
      properties: { name: "Klaipėdos g.", street: "Klaipėdos g.", city: "Pagėgiai", country: "Lietuva" },
    },
  ],
};

describe("parsePhotonPlaces", () => {
  it("sudeda gatvę su namo numeriu", () => {
    expect(parsePhotonPlaces(ATSAKYMAS)[0]).toEqual({
      label: "Klaipėdos gatvė 45",
      sublabel: "Panevėžys, 35217, Lietuva",
      latitude: 55.7276,
      longitude: 24.3462,
    });
  });

  it("koordinates ima teisinga tvarka", () => {
    // GeoJSON'e eina ilguma, platuma. Sukeitus vietomis 24,3 taptų platuma,
    // ir fura atsidurtų Afrikoje, o skaičius atrodytų tvarkingas.
    const [pirmas] = parsePhotonPlaces(ATSAKYMAS);
    expect(pirmas.latitude).toBeGreaterThan(50);
    expect(pirmas.longitude).toBeLessThan(30);
  });

  it("tos pačios gatvės nekartoja", () => {
    expect(parsePhotonPlaces(ATSAKYMAS)).toHaveLength(2);
  });

  it("riboja sąrašo ilgį", () => {
    expect(parsePhotonPlaces(ATSAKYMAS, 1)).toHaveLength(1);
  });

  it("praleidžia įrašus be gatvės ar be taško", () => {
    expect(parsePhotonPlaces({ features: [{ geometry: { coordinates: [1, 2] }, properties: {} }] })).toEqual([]);
    expect(parsePhotonPlaces({ features: [{ properties: { street: "be taško" } }] })).toEqual([]);
  });

  it("netinkamas atsakymas duoda tuščią sąrašą", () => {
    expect(parsePhotonPlaces({})).toEqual([]);
    expect(parsePhotonPlaces(null)).toEqual([]);
  });
});

describe("placeLabel", () => {
  it("sujungia adresą į vieną eilutę", () => {
    const [pirmas] = parsePhotonPlaces(ATSAKYMAS);
    expect(placeLabel(pirmas)).toBe("Klaipėdos gatvė 45, Panevėžys, 35217, Lietuva");
  });

  it("be miesto palieka vien pavadinimą", () => {
    expect(placeLabel({ label: "Oslo", sublabel: "", latitude: 59.9, longitude: 10.7 })).toBe("Oslo");
  });
});
