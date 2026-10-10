/**
 * Minimali marža (#181).
 *
 * Įmonė nustato ribą, žemiau kurios reisas laikomas per pigiu. Kol skaičius
 * tik rodomas, nuostolingas ar beveik nuostolingas užsakymas priimamas, nes
 * niekas jo nepažymi – ypač kai kainą skaičiuoja naujas darbuotojas.
 *
 * Marža skaičiuojama nuo pajamų, kaip ir visur programoje (`lib/pricing.ts`).
 */

import { priceForMargin } from "./pricing";

/** Didžiausia prasminga riba: 100 % reikštų pajamas be kaštų. */
const MAX_MIN_MARGIN = 99.99;

export type ParsedMinMargin = { ok: true; value: number | null } | { ok: false; error: string };

/** Ribą iš formos teksto. Tuščia – riba nenustatyta. Kablelis leidžiamas. */
export function parseMinMargin(text: string): ParsedMinMargin {
  const trimmed = text.trim().replace(/\s*%$/, "");
  if (trimmed === "") return { ok: true, value: null };

  const value = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(value) || value < 0 || value > MAX_MIN_MARGIN) {
    return { ok: false, error: "Įrašykite skaičių nuo 0 iki 99,99." };
  }
  // Duomenų bazėje saugoma dviem skaitmenimis po kablelio.
  return { ok: true, value: Math.round(value * 100) / 100 };
}

export type MarginCheck =
  /** Ribos nėra arba pajamų nėra – lyginti nėra su kuo. */
  | { status: "none" }
  | { status: "ok" }
  | {
      status: "below";
      minMarginPercent: number;
      /** Kaina, kuriai esant reisas pasiektų ribą. `null`, kai kaštų nėra. */
      priceAtMinCents: number | null;
      /** Kiek trūksta iki tos kainos. `null`, kai kainos nėra. */
      shortfallCents: number | null;
    };

/**
 * Ar reiso marža ne žemesnė už įmonės ribą.
 *
 * Lygi ribai – gerai: riba reiškia „ne mažiau“, ne „daugiau nei“.
 */
export function checkMargin(input: {
  marginPercent: number | null;
  minMarginPercent: number | null;
  totalCostCents: number;
  revenueCents: number;
}): MarginCheck {
  const { marginPercent, minMarginPercent, totalCostCents, revenueCents } = input;
  if (minMarginPercent === null || marginPercent === null) return { status: "none" };

  // Lyginama apvalinant iki šimtųjų – kaip riba ir saugoma. Kitaip 11,999… %
  // būtų „žemiau“ 12 % ribos, nors žmogui rodoma 12,0 %.
  if (Math.round(marginPercent * 100) >= Math.round(minMarginPercent * 100)) {
    return { status: "ok" };
  }

  const priceAtMinCents = priceForMargin(totalCostCents, minMarginPercent);
  return {
    status: "below",
    minMarginPercent,
    priceAtMinCents,
    shortfallCents: priceAtMinCents === null ? null : Math.max(0, priceAtMinCents - revenueCents),
  };
}

/** Ar norima marža kainos pasiūlymui nesiekia įmonės ribos. */
export function targetBelowMin(targetMarginPercent: number, minMarginPercent: number | null): boolean {
  if (minMarginPercent === null || !Number.isFinite(targetMarginPercent)) return false;
  return Math.round(targetMarginPercent * 100) < Math.round(minMarginPercent * 100);
}

/** Riba kaip rodoma žmogui: „12 %“, „12,5 %“. */
export function formatMinMargin(value: number): string {
  return `${value.toLocaleString("lt-LT", { maximumFractionDigits: 2 })} %`;
}
