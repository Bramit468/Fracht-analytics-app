/**
 * Pelningumas pagal furą (#101).
 *
 * Suvestinė rodo visos įmonės sumas, sąrašas — atskirus reisus. Tarp jų trūksta
 * to, ko iš tikrųjų klausiama: kuri fura neša pinigus, o kuri juos ėda. Su
 * dvidešimt dviem furomis to iš reisų sąrašo nesuskaičiuosi.
 *
 * Skaičiuojama iš bendrų sumų, o ne kaip reisų vidurkis — dėl tos pačios
 * priežasties kaip `lib/dashboard.ts`: vidurkyje 200 € reisas svertų tiek pat,
 * kiek 12 000 € reisas.
 */

import type { TripSummary } from "./trips";

export interface TruckProfit {
  plate: string;
  tripCount: number;
  paidKm: number;
  revenueCents: number;
  totalCostCents: number;
  profitCents: number;
  /** Pelnas / pajamos. `null`, kai pajamų nėra. */
  marginPercent: number | null;
  /** Pelnas eurais už apmokamą km. `null`, kai km nėra. */
  profitPerKm: number | null;
}

/** Furos, pelningiausia viršuje. Vienodo pelno atveju — pagal numerį. */
export function summarizeByTruck(trips: TripSummary[]): TruckProfit[] {
  const byPlate = new Map<string, TruckProfit>();

  for (const trip of trips) {
    const row = byPlate.get(trip.truckPlate) ?? {
      plate: trip.truckPlate,
      tripCount: 0,
      paidKm: 0,
      revenueCents: 0,
      totalCostCents: 0,
      profitCents: 0,
      marginPercent: null,
      profitPerKm: null,
    };

    row.tripCount += 1;
    row.paidKm += trip.paidKm;
    row.revenueCents += trip.revenueCents;
    row.totalCostCents += trip.totalCostCents;
    row.profitCents += trip.profitCents;

    byPlate.set(trip.truckPlate, row);
  }

  for (const row of byPlate.values()) {
    row.marginPercent =
      row.revenueCents > 0 ? (row.profitCents / row.revenueCents) * 100 : null;
    row.profitPerKm = row.paidKm > 0 ? row.profitCents / 100 / row.paidKm : null;
  }

  return [...byPlate.values()].sort(
    (a, b) => b.profitCents - a.profitCents || a.plate.localeCompare(b.plate),
  );
}
