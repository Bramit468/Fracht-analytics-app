import { describe, expect, it } from "vitest";

import {
  firstPlace,
  placeSuggestions,
  routeEstimate,
  routeFill,
  routeRequestUrl,
  routeTiming,
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
  trafficDelay: 754,
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
    sections: [
      { tollRoadType: "GENERAL", countryCode: "PL", costs: [{ convertedPrice: { price: 161.92, currency: "EUR" } }] },
      { tollRoadType: "GENERAL", countryCode: "DE", costs: [{ convertedPrice: { price: 113.48, currency: "EUR" } }] },
      { tollRoadType: "BRIDGE", countryCode: "DK", costs: [{ convertedPrice: { price: 195.13, currency: "EUR" } }] },
      { tollRoadType: "TUNNEL", countryCode: "SE", costs: [{ convertedPrice: { price: 0.8, currency: "EUR" } }] },
      { tollRoadType: "FERRY", countryCode: "NO", costs: [{ convertedPrice: { price: 14.16, currency: "EUR" } }] },
    ],
  },
  events: [
    { combinedTransport: { name: "Gedser - Rostock", type: "BOAT", accessType: "ENTER" } },
    { combinedTransport: { name: "Gedser - Rostock", type: "BOAT", accessType: "EXIT" } },
  ],
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
      travelMinutes: 1794,
      trafficDelayMinutes: 13,
      tollCents: 48549,
      bridgesCents: 47053,
      ferriesCents: 1416,
      tunnelsCents: 80,
      ferryDetected: true,
      ferryNames: ["Gedser - Rostock"],
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

    expect(estimate).toMatchObject({
      km: 120,
      tollCents: 0,
      bridgesCents: 0,
      ferriesCents: 0,
      tunnelsCents: 0,
      ferryDetected: false,
      trafficDelayMinutes: 0,
      byCountry: [],
    });
  });

  it("aptinka keltą net kai PTV nepateikia jo kainos", () => {
    const estimate = routeEstimate({
      distance: 100000,
      travelTime: 7200,
      events: [{ combinedTransport: { name: "Rostock - Gedser", type: "BOAT", accessType: "ENTER" } }],
    });

    expect(estimate).toMatchObject({
      ferryDetected: true,
      ferryNames: ["Rostock - Gedser"],
      ferriesCents: 0,
    });
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
      bridges_cents: "470.53",
      ferries_cents: "14.16",
      tunnels_cents: "0.80",
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

  it("aptikto kelto be kainos nerodo kaip nulio", () => {
    const estimate = routeEstimate({
      distance: 100000,
      events: [{ combinedTransport: { name: "Rostock - Gedser", type: "BOAT", accessType: "ENTER" } }],
    });
    if (!estimate) throw new Error("įvertis turėjo būti");

    expect(routeFill(estimate).ferries_cents).toBe("");
  });
});

describe("routeRequestUrl", () => {
  const from = { latitude: 54.1, longitude: 12.1 };
  const to = { latitude: 54.6, longitude: 11.4 };

  it("prašo mokesčių sekcijų ir kelto įvykių", () => {
    const url = new URL(routeRequestUrl(from, to, false));

    expect(url.searchParams.get("results")).toBe(
      "TOLL_COSTS,TOLL_SECTIONS,COMBINED_TRANSPORT_EVENTS,POLYLINE",
    );
    expect(url.searchParams.get("options[currency]")).toBe("EUR");
    expect(url.searchParams.has("options[avoid]")).toBe(false);
  });

  it("naudoja oficialų FERRIES vengimo parametrą", () => {
    const url = new URL(routeRequestUrl(from, to, true));

    expect(url.searchParams.get("options[avoid]")).toBe("FERRIES");
  });

  it("perduoda išvykimo laiką ir eismo režimą", () => {
    const timing = routeTiming(
      "2026-09-24T10:00:00.000Z",
      new Date("2026-09-24T08:00:00.000Z"),
    );
    if (!timing) throw new Error("laikas turėjo būti teisingas");

    const url = new URL(routeRequestUrl(from, to, false, timing));

    expect(url.searchParams.get("startTime")).toBe("2026-09-24T10:00:00.000Z");
    expect(url.searchParams.get("options[trafficMode]")).toBe("REALISTIC");
  });
});

describe("routeTiming", () => {
  const now = new Date("2026-09-24T08:00:00.000Z");

  it("artimam išvykimui naudoja gyvą eismą", () => {
    expect(routeTiming("2026-09-24T12:00:00+02:00", now)).toEqual({
      startTime: "2026-09-24T10:00:00.000Z",
      trafficMode: "REALISTIC",
    });
  });

  it("tolimesniam išvykimui naudoja tipinį eismą", () => {
    expect(routeTiming("2026-09-25T08:00:00.000Z", now)?.trafficMode).toBe("AVERAGE");
  });

  it("be datos palieka PTV numatytą išvykimą dabar", () => {
    expect(routeTiming(undefined, now)).toEqual({ trafficMode: "REALISTIC" });
  });

  it("atmeta neteisingą laiką", () => {
    expect(routeTiming("ne data", now)).toBeNull();
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
