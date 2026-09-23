/**
 * Planas prieš faktą (#59).
 *
 * `lib/calc.ts` skaičiuoja, kiek reisas **turėjo** kainuoti pagal normas,
 * `lib/telematics-costs.ts` — kiek kainavo **iš tikrųjų**. Čia jie sugretinami.
 *
 * Tai ne ataskaita, o grįžtamasis ryšys kitam pasiūlymui: jei fura kasmet
 * degina 27 l/100, o skaičiuojama pagal 25, kiekvienas reisas parduodamas
 * pigiau, nei turėtų, ir niekas to nepastebi.
 */

import type { TripResult } from "./calc";
import type { ActualCosts } from "./telematics-costs";

/** Vienas gretinamas dydis. */
export interface VarianceLine {
  key: "fuel" | "adblue" | "road";
  plannedCents: number;
  actualCents: number;
  /** Faktas minus planas. Teigiamas — brangiau, nei planuota. */
  diffCents: number;
}

/** Priežastis, o ne suma: kodėl faktas skiriasi. */
export interface VarianceRatio {
  planned: number;
  actual: number | null;
  /** Faktas minus planas. `null`, kai fakto nėra. */
  diff: number | null;
}

export interface TripVariance {
  lines: VarianceLine[];
  /**
   * Kiek pelnas realiai mažesnis, nei rodo reisas. Teigiamas — reisas
   * uždirbo mažiau, nei atrodo.
   *
   * Skaičiuojama tik iš kintamų kaštų: furos paros kaštai abiejose pusėse
   * vienodi, nes telematika jų neturi ir turėti negali.
   */
  profitImpactCents: number;
  plannedProfitCents: number;
  actualProfitCents: number;
  litresPer100Km: VarianceRatio;
  fuelPricePerL: VarianceRatio;
  km: VarianceRatio;
}

/** Tik tie reiso laukai, kurių reikia priežastims parodyti. */
export interface PlannedInputs {
  fuel_l_per_100km: number;
  fuel_price: number;
  paid_km: number;
  empty_km: number;
}

function ratio(planned: number, actual: number | null): VarianceRatio {
  return { planned, actual, diff: actual === null ? null : actual - planned };
}

/**
 * Sugretina išsaugotą reisą su to paties vilkiko faktiniais kaštais.
 *
 * **Faktas imamas visai furai per reiso dienas.** Jei tomis dienomis fura vežė
 * daugiau nei vieną reisą, tie patys kaštai bus priskirti kiekvienam iš jų.
 * Skaičius pasirodys per didelis, todėl apribojimą privalo matyti ir
 * vartotojas, ne tik skaitantis kodą.
 */
export function compareTripToActuals(
  trip: PlannedInputs,
  planned: TripResult,
  actual: ActualCosts,
): TripVariance {
  const pairs = [
    { key: "fuel", plannedCents: planned.fuelCents, actualCents: actual.dieselCents },
    { key: "adblue", plannedCents: planned.adblueCents, actualCents: actual.adblueCents },
    { key: "road", plannedCents: planned.roadCents, actualCents: actual.tollCents },
  ] as const;

  const lines: VarianceLine[] = pairs.map((line) => ({
    ...line,
    diffCents: line.actualCents - line.plannedCents,
  }));

  const profitImpactCents = lines.reduce((total, line) => total + line.diffCents, 0);

  return {
    lines,
    profitImpactCents,
    plannedProfitCents: planned.profitCents,
    // Pajamos ir furos kaštai nesikeičia, tad faktinį pelną nuo planuoto
    // skiria būtent kintamų kaštų skirtumas.
    actualProfitCents: planned.profitCents - profitImpactCents,
    litresPer100Km: ratio(trip.fuel_l_per_100km, actual.litresPer100Km),
    fuelPricePerL: ratio(trip.fuel_price, actual.fuelPricePerL),
    km: ratio(trip.paid_km + trip.empty_km, actual.km > 0 ? actual.km : null),
  };
}
