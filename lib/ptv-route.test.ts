import { describe, expect, it } from "vitest";

import {
  firstPlace,
  parseSuggestions,
  placeSuggestions,
  routeEstimate,
  routeFill,
  suggestedDays,
} from "./ptv-route";

/** Sutrumpinta tikro atsakymo kopija: Klaipėdos g. 45, Panevėžys. */
const GEOCODING = {
  locations: [
    {
      formattedAddress: "Klaipėdos gatvė 45, 35218 Panevėžys",
      locationType: "EXACT_ADDRESS",
      referencePosition: { latitude: 55.72755813598633, longitude: 24.346189498901367 },
    },
  ],
};

/** Sutrumpinta tikro atsakymo kopija: Panevėžys -> Oslas, 40 t vilkikas. */
const ROUTE = {
  distance: 2060355,
  travelTime: 107623,
  violated: false,
  toll: {
    costs: {
      countries: [
        { countryCode: "LT", convertedPrice: { price: 0.0, currency: "EUR" } },
        { countryCode: "PL", convertedPrice: { price: 161.92, currency: "EUR" } },
        { countryCode: "DE", convertedPrice: { price: 113.48, currency: "EUR" } },
        { countryCode: "DK", convertedPrice: { price: 195.13, currency: "EUR" } },
        { countryCode: "SE", convertedPrice: { price: 0.8, currency: "EUR" } },
        { countryCode: "NO", convertedPrice: { price: 14.16, currency: "EUR" } },
      ],
    },
  },
};

describe("firstPlace", () => {
  it("paima koordinates ir tai, ką PTV suprato", () => {
    expect(firstPlace(GEOCODING)).toEqual({
      latitude: 55.72755813598633,
      longitude: 24.346189498901367,
      formattedAddress: "Klaipėdos gatvė 45, 35218 Panevėžys",
      locationType: "EXACT_ADDRESS",
    });
  });

  it("neatpažintas adresas grąžina null, o ne tuščią tašką", () => {
    // Nulinės koordinatės yra Gvinėjos įlankoje – maršrutas būtų suskaičiuotas
    // ir atrodytų teisingas.
    expect(firstPlace({ locations: [] })).toBeNull();
    expect(firstPlace({})).toBeNull();
    expect(firstPlace(null)).toBeNull();
    expect(firstPlace({ locations: [{ formattedAddress: "be taško" }] })).toBeNull();
  });
});

describe("parseSuggestions", () => {
  /** Sutrumpinta tikro autocomplete atsakymo kopija: „klaipedos g“. */
  const ATSAKYMAS = {
    suggestions: [
      { caption: "Gargždai Klaipėdos Apskritis", subCaption: "Lietuva Klaipėdos rajono savivaldybė", searchText: "Lietuva Klaipėdos Apskritis Gargždai" },
      { caption: "Gardamas Klaipėdos Apskritis", subCaption: "Lietuva Šilutės rajono savivaldybė", searchText: "Lietuva Klaipėdos Apskritis Gardamas" },
      { caption: "Gardamas Klaipėdos Apskritis", subCaption: "Lietuva Šilutės rajono savivaldybė", searchText: "kartojasi" },
    ],
  };

  it("paima pavadinimą, paaiškinimą ir paieškos tekstą", () => {
    expect(parseSuggestions(ATSAKYMAS)[0]).toEqual({
      caption: "Gargždai Klaipėdos Apskritis",
      subCaption: "Lietuva Klaipėdos rajono savivaldybė",
      searchText: "Lietuva Klaipėdos Apskritis Gargždai",
    });
  });

  it("vienodai atrodančių eilučių nekartoja", () => {
    // PTV grąžina dešimt Gardamų skirtingose seniūnijose; sąraše jie
    // neatskiriami, tad rodyti visus reikštų tik trukdyti.
    expect(parseSuggestions(ATSAKYMAS)).toHaveLength(2);
  });

  it("riboja sąrašo ilgį", () => {
    expect(parseSuggestions(ATSAKYMAS, 1)).toHaveLength(1);
  });

  it("praleidžia eilutes be paieškos teksto", () => {
    // Be jo pasirinkimo nepaversi koordinatėmis, tad rodyti nėra prasmės.
    expect(parseSuggestions({ suggestions: [{ caption: "be teksto" }] })).toEqual([]);
  });

  it("netinkamas atsakymas duoda tuščią sąrašą", () => {
    expect(parseSuggestions({})).toEqual([]);
    expect(parseSuggestions(null)).toEqual([]);
  });
});

describe("placeSuggestions", () => {
  /** „Klaipėdos g. 4“ PTV grąžina 42 adresus keturiuose miestuose. */
  const DAUG = {
    locations: [
      { formattedAddress: "Klaipėdos gatvė 4, 40411 Subačius", locationType: "EXACT_ADDRESS", referencePosition: { latitude: 55.7, longitude: 24.7 } },
      { formattedAddress: "Klaipėdos gatvė 4, 89213 Mažeikiai", locationType: "EXACT_ADDRESS", referencePosition: { latitude: 56.3, longitude: 22.3 } },
      { formattedAddress: "Klaipėdos gatvė 4, 87303 Telšiai", locationType: "EXACT_ADDRESS", referencePosition: { latitude: 55.9, longitude: 22.2 } },
    ],
  };

  it("grąžina visus variantus, o ne pirmą", () => {
    // Visi jie vienodo tikslumo, tad pirmas sąraše yra atsitiktinis. Imti jį
    // reikštų nuvesti furą į Mažeikius, kai žmogus galvojo apie Telšius.
    expect(placeSuggestions(DAUG)).toHaveLength(3);
  });

  it("riboja sąrašo ilgį", () => {
    expect(placeSuggestions(DAUG, 2)).toHaveLength(2);
  });

  it("nekartoja to paties adreso", () => {
    const suPasikartojimu = { locations: [...DAUG.locations, DAUG.locations[0]] };
    expect(placeSuggestions(suPasikartojimu)).toHaveLength(3);
  });

  it("praleidžia įrašus be taško", () => {
    expect(placeSuggestions({ locations: [{ formattedAddress: "be taško" }] })).toEqual([]);
  });

  it("tuščias ar netinkamas atsakymas duoda tuščią sąrašą", () => {
    expect(placeSuggestions({})).toEqual([]);
    expect(placeSuggestions(null)).toEqual([]);
    expect(placeSuggestions({ locations: "ne sąrašas" })).toEqual([]);
  });
});

describe("routeEstimate", () => {
  it("verčia metrus, sekundes ir mokesčius", () => {
    const estimate = routeEstimate(ROUTE);

    expect(estimate).toMatchObject({
      km: 2060.36,
      travelHours: 29.9,
      tollCents: 48549,
      violated: false,
    });
  });

  it("mokesčiai suskaidyti pagal šalis", () => {
    const estimate = routeEstimate(ROUTE);

    expect(estimate?.byCountry).toEqual([
      { countryCode: "LT", euroCents: 0 },
      { countryCode: "PL", euroCents: 16192 },
      { countryCode: "DE", euroCents: 11348 },
      { countryCode: "DK", euroCents: 19513 },
      { countryCode: "SE", euroCents: 80 },
      { countryCode: "NO", euroCents: 1416 },
    ]);
  });

  it("maršrutas be mokesčių duoda nulį, o ne klaidą", () => {
    const estimate = routeEstimate({ distance: 120000, travelTime: 5400, violated: false });

    expect(estimate).toMatchObject({ km: 120, tollCents: 0, byCountry: [] });
  });

  it("pažeistas ribojimas perduodamas toliau", () => {
    // PTV taip pasako, kad vilkikui tinkamo kelio nerado. Tylėti negalima.
    expect(routeEstimate({ ...ROUTE, violated: true })?.violated).toBe(true);
  });

  it("atsakymas be atstumo grąžina null", () => {
    expect(routeEstimate({ travelTime: 100 })).toBeNull();
    expect(routeEstimate(null)).toBeNull();
  });
});

describe("routeFill", () => {
  it("užpildo laukus taip, kaip juos skaito forma", () => {
    const estimate = routeEstimate(ROUTE);
    if (!estimate) throw new Error("įvertis turėjo būti");

    expect(routeFill(estimate)).toEqual({
      paid_km: "2060.36",
      bridges_cents: "485.49",
      legKm: "2060.36",
    });
  });

  it("parų neužpildo", () => {
    const estimate = routeEstimate(ROUTE);
    if (!estimate) throw new Error("įvertis turėjo būti");

    // Kelio laikas nėra reiso trukmė. Spėta trukmė tyliai iškreiptų furos
    // paros kaštus, o su jais ir pelną.
    expect(Object.keys(routeFill(estimate))).not.toContain("days");
  });
});

describe("suggestedDays", () => {
  it("paromis, apvalinant į viršų", () => {
    expect(suggestedDays(29.9)).toBe(4);
    expect(suggestedDays(9)).toBe(1);
    expect(suggestedDays(9.1)).toBe(2);
  });

  it("trumpas reisas vis tiek yra viena para", () => {
    // Nulis parų reikštų, kad fura tą dieną nieko nekainavo.
    expect(suggestedDays(0.5)).toBe(1);
    expect(suggestedDays(0)).toBe(1);
  });
});
