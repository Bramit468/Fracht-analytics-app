/**
 * Pelningumas pagal furą (#101).
 *
 * Suvestinė rodo visos įmonės sumas, sąrašas — atskirus reisus. Tarp jų trūksta
 * to, ko iš tikrųjų klausiama: kuri fura neša pinigus, o kuri juos ėda. Su
 * dvidešimt dviem furomis to iš reisų sąrašo nesuskaičiuosi.
 */

import { groupProfit, type ProfitGroup } from "./group-profit";
import type { TripSummary } from "./trips";

export interface TruckProfit extends Omit<ProfitGroup, "key"> {
  plate: string;
}

/** Furos, pelningiausia viršuje. Vienodo pelno atveju — pagal numerį. */
export function summarizeByTruck(trips: TripSummary[]): TruckProfit[] {
  return groupProfit(trips, (trip) => trip.truckPlate).map(({ key, ...totals }) => ({
    plate: key,
    ...totals,
  }));
}
