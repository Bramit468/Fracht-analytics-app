/**
 * Maršruto variantų palyginimas (#84).
 *
 * PTV moka pasiūlyti ne vieną kelią, o kelis, ir skirtumas tarp jų yra pinigai,
 * ne skonio reikalas. Patikrinta su tikru raktu, Panevėžys–Oslas:
 *
 *   2054 km, 29,5 val., keliai 483,40 €   (keltas Rostock–Gedser)
 *   2055 km, 30,7 val., keliai 350,45 €   (tas pats keltas, 133 € pigiau)
 *   1292 km, 30,1 val., keliai  14,13 €   (keltas Paldiski–Kapellskär)
 *
 * Trečiasis atrodo nepalyginamai pigiausias, bet tik todėl, kad PTV neturi to
 * kelto bilieto kainos. Todėl nežinoma kelto kaina **nerodoma kaip nulis**: toks
 * variantas lieka sąraše, bet be bendros sumos ir pigiausiu nevadinamas.
 */

import type { RouteEstimate } from "./ptv-route";

export interface RouteOptionSource extends RouteEstimate {
  /** PTV maršruto raktas. `null` – pagrindinis variantas. */
  routeId: string | null;
}

export interface RouteOption extends RouteOptionSource {
  /** Kuras pagal reiso normą ir kainą. */
  fuelCents: number;
  /** Keliai plius kuras. `null`, kai kelto kaina nežinoma. */
  totalCents: number | null;
  /** Keltas yra, bet PTV jo kainos neturi. */
  ferryPriceUnknown: boolean;
  fastest: boolean;
  cheapest: boolean;
}

/** Reiso kuro norma ir kaina – tos pačios, kurios įvestos formoje. */
export interface FuelBasis {
  litresPer100Km: number;
  /** Euro centai už litrą, kad sumos liktų sveikais skaičiais. */
  priceCentsPerLitre: number;
}

/**
 * Kuro kaštai maršrutui.
 *
 * Skaičiuojama centais ir apvalinama vieną kartą pabaigoje: sudėjus apvalintus
 * tarpinius rezultatus, ilgame reise susikauptų keli centai skirtumo.
 */
export function fuelCostCents(km: number, fuel: FuelBasis): number {
  if (!(km > 0) || !(fuel.litresPer100Km > 0) || !(fuel.priceCentsPerLitre > 0)) return 0;
  return Math.round((km * fuel.litresPer100Km * fuel.priceCentsPerLitre) / 100);
}

/**
 * Variantai su kaštais, pigiausias viršuje.
 *
 * Nežinomos kelto kainos variantai lieka gale: jie gali būti ir pigiausi, ir
 * brangiausi, o spėti už vartotoją čia būtų blogiausia, ką galima padaryti.
 */
export function compareRouteOptions(
  sources: RouteOptionSource[],
  fuel: FuelBasis,
): RouteOption[] {
  const options: RouteOption[] = sources.map((source) => {
    const ferryPriceUnknown = source.ferryDetected && source.ferriesCents === 0;
    const fuelCents = fuelCostCents(source.km, fuel);

    return {
      ...source,
      fuelCents,
      totalCents: ferryPriceUnknown ? null : source.tollCents + fuelCents,
      ferryPriceUnknown,
      fastest: false,
      cheapest: false,
    };
  });

  if (options.length === 0) return options;

  const priced = options.filter((option) => option.totalCents !== null);
  const cheapest = priced.reduce<RouteOption | null>(
    (best, option) =>
      best === null || (option.totalCents ?? 0) < (best.totalCents ?? 0) ? option : best,
    null,
  );
  const fastest = options.reduce((best, option) =>
    option.travelMinutes < best.travelMinutes ? option : best,
  );

  if (cheapest) cheapest.cheapest = true;
  fastest.fastest = true;

  return [...options].sort((a, b) => {
    if (a.totalCents === null && b.totalCents === null) return a.km - b.km;
    if (a.totalCents === null) return 1;
    if (b.totalCents === null) return -1;
    return a.totalCents - b.totalCents;
  });
}

/** Kiek brangesnis variantas už pigiausią. `null`, kai palyginti nėra su kuo. */
export function extraCostCents(option: RouteOption, options: RouteOption[]): number | null {
  const cheapest = options.find((row) => row.cheapest);
  if (!cheapest || cheapest.totalCents === null || option.totalCents === null) return null;
  return option.totalCents - cheapest.totalCents;
}
