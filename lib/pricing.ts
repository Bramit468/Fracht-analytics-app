/**
 * Kainos pasiūlymas pagal norimą pelną (#71).
 *
 * `lib/calc.ts` atsako „kiek uždirbsiu už šitą kainą". Bet skambinant užsakovui
 * klausimas yra atvirkščias: kaštai žinomi, reikia kainos.
 *
 * Skaičiuojama nuo **pajamų**, ne nuo kaštų. Vežime marža įprastai reiškia
 * dalį nuo sąskaitos sumos: 20 % marža prie 800 € kaštų yra 1000 €, o ne 960 €.
 * Sumaišius tai su antkainiu, kiekvienas pasiūlymas būtų per pigus.
 */

/** Riba, už kurios kaina nebeturi prasmės: 100 % marža reikštų begalybę. */
const MAX_MARZA = 99.9;

/**
 * Kaina, kuriai esant marža bus tokia, kokios nori.
 *
 * `null`, kai marža nepasiekiama — 100 % ir daugiau reikštų pajamas be kaštų.
 */
export function priceForMargin(costCents: number, marginPercent: number): number | null {
  if (!Number.isFinite(marginPercent) || marginPercent >= MAX_MARZA) return null;
  if (costCents <= 0) return null;

  // marža = (kaina - kaštai) / kaina  =>  kaina = kaštai / (1 - marža)
  return Math.round(costCents / (1 - marginPercent / 100));
}

/** Kaina, kuriai esant pelnas bus tokia, kokios nori. */
export function priceForProfit(costCents: number, profitCents: number): number {
  return costCents + profitCents;
}

/**
 * Kokia marža gaunasi už tokią kainą.
 *
 * `null`, kai pajamų nėra — dalyba iš nulio, o ne nulinė marža.
 */
export function marginForPrice(costCents: number, priceCents: number): number | null {
  if (priceCents <= 0) return null;
  return ((priceCents - costCents) / priceCents) * 100;
}

/** Ta pati kaina, išreikšta įkainiu už apmokamą kilometrą. */
export function pricePerKm(priceCents: number, paidKm: number): number | null {
  if (!(paidKm > 0)) return null;
  return priceCents / 100 / paidKm;
}

/** Ta pati suma per parą, centais. Fura uždirba paromis, ne tik kilometrais. */
export function pricePerDay(priceCents: number, days: number): number | null {
  if (!(days > 0)) return null;
  return Math.round(priceCents / days);
}

export interface BaselineQuote {
  /** Visi reiso kaštai be kuro: fura, keliai, AdBlue. */
  baselineCents: number;
  markupCents: number;
  /** Baseline rate: kaštai be kuro + antkainis. */
  baselineRateCents: number;
  fuelCents: number;
  /** Tinkama krovinio kaina: baseline rate + kuras. */
  priceCents: number;
  /** Kokia marža nuo visos kainos išeina. `null`, kai kainos nėra. */
  marginPercent: number | null;
}

/**
 * Įmonės kainos būdas: antkainis tik kaštams be kuro, kuras pridedamas be
 * antkainio. Kuras – praėjimo kaštas: jo kainos įmonė nevaldo, o užsakovas jį
 * mato atskirai. Antkainis skaičiuojamas nuo kaštų (×1,2), ne nuo kainos, todėl
 * marža nuo visos kainos išeina mažesnė – ji grąžinama, kad būtų matyti.
 */
export function baselineQuote(totalCostCents: number, fuelCents: number, markupPercent: number): BaselineQuote | null {
  if (!Number.isFinite(markupPercent) || markupPercent < 0) return null;
  const baselineCents = totalCostCents - fuelCents;
  if (baselineCents <= 0) return null;
  const markupCents = Math.round((baselineCents * markupPercent) / 100);
  const baselineRateCents = baselineCents + markupCents;
  const priceCents = baselineRateCents + fuelCents;
  return {
    baselineCents,
    markupCents,
    baselineRateCents,
    fuelCents,
    priceCents,
    marginPercent: marginForPrice(totalCostCents, priceCents),
  };
}
