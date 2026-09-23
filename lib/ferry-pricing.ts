/**
 * Viešas Scandlines Freight tarifas Rostock–Gedser reisui.
 *
 * Bazinis tarifas galioja nuo 2026-01-01 iki atšaukimo. BAF/GIR/ETS
 * priemoka yra 2026 m. rugsėjo ir turi būti atnaujinta pasikeitus mėnesiui.
 * Visos sumos laikomos centais, kad skaičiavime nebūtų float paklaidų.
 */

export const SCANDLINES_TARIFF_PERIOD = "2026 m. rugsėjis";
export const SCANDLINES_TARIFF_URL =
  "https://freight.scandlines.com/assets/Scandlines_Freight_Tariff_2026_Germany_Denmark_10m_2026_01_01_until_recall_6a109ca4de.pdf";
export const SCANDLINES_SURCHARGE_URL =
  "https://freight.scandlines.com/assets/09_Scandlines_surcharges_September_2026_ENG_0113afc41b.pdf";

export type FreightLoad = "loaded" | "empty";

interface BaseFare {
  loaded: number;
  empty: number;
}

/** Rostock–Gedser bazinis tarifas vienam plaukimui, be PVM. */
const ROSTOCK_GEDSER_BASE_CENTS: Record<number, BaseFare> = {
  10: { loaded: 13940, empty: 7910 },
  11: { loaded: 15190, empty: 8640 },
  12: { loaded: 16650, empty: 9580 },
  13: { loaded: 18000, empty: 10300 },
  14: { loaded: 19360, empty: 11030 },
  15: { loaded: 20810, empty: 11870 },
  16: { loaded: 22160, empty: 12800 },
  17: { loaded: 23620, empty: 13520 },
  18: { loaded: 24970, empty: 14260 },
  19: { loaded: 26330, empty: 15080 },
  20: { loaded: 27780, empty: 15810 },
  21: { loaded: 29130, empty: 16650 },
  22: { loaded: 30490, empty: 17370 },
  23: { loaded: 31940, empty: 18210 },
  24: { loaded: 33180, empty: 18940 },
  25: { loaded: 34650, empty: 19770 },
  26: { loaded: 36110, empty: 20710 },
};

/** 2026-09 BAF 3,79 + GIR 1,66 + ETS 0,67 už kiekvieną pradėtą metrą. */
const SEPTEMBER_2026_SURCHARGE_PER_METRE_CENTS = 612;

export interface FerryFareEstimate {
  route: "Rostock–Gedser";
  billedMetres: number;
  load: FreightLoad;
  baseCents: number;
  surchargeCents: number;
  totalCents: number;
}

/** PTV pavadinimai būna abiem kryptimis ir su skirtingais brūkšniais. */
export function isRostockGedser(names: readonly string[]): boolean {
  return names.some((name) => {
    const normalized = name.toLocaleLowerCase("en");
    return normalized.includes("rostock") && normalized.includes("gedser");
  });
}

/**
 * Apskaičiuoja viešo tarifo įvertį. Ilgis apvalinamas į viršų, nes
 * Scandlines skaičiuoja kiekvieną pradėtą metrą. 7–9 m ir virš 26 m
 * vienetams taikomi kiti tarifai, todėl jų čia nespėjame.
 */
export function estimateScandlinesFreightFare(
  ferryNames: readonly string[],
  unitLengthMetres: number,
  load: FreightLoad,
): FerryFareEstimate | null {
  if (!isRostockGedser(ferryNames) || !Number.isFinite(unitLengthMetres)) return null;

  const billedMetres = Math.ceil(unitLengthMetres);
  const base = ROSTOCK_GEDSER_BASE_CENTS[billedMetres];
  if (!base) return null;

  const baseCents = base[load];
  const surchargeCents = billedMetres * SEPTEMBER_2026_SURCHARGE_PER_METRE_CENTS;
  return {
    route: "Rostock–Gedser",
    billedMetres,
    load,
    baseCents,
    surchargeCents,
    totalCents: baseCents + surchargeCents,
  };
}
