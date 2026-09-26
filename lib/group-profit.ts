/**
 * Pelningumas pagal bet kokį požymį (#107).
 *
 * Tas pats skaičiavimas reikalingas ne vienam pjūviui — pagal furą, pagal
 * kryptį, vėliau gal pagal vairuotoją. Skiriasi tik tai, pagal ką grupuojama,
 * todėl čia laikoma sudėtis, o ne dar vienas jos nuorašas.
 *
 * Sumos imamos bendros, o ne kaip reisų vidurkis: vidurkyje 200 € reisas svertų
 * tiek pat, kiek 12 000 € reisas.
 */

import type { TripSummary } from "./trips";

export interface ProfitGroup {
  key: string;
  tripCount: number;
  paidKm: number;
  revenueCents: number;
  totalCostCents: number;
  profitCents: number;
  /** Pelnas / pajamos. `null`, kai pajamų nėra. */
  marginPercent: number | null;
  /** Pelnas eurais už apmokamą km. `null`, kai km nėra. */
  profitPerKm: number | null;
  /** Savikaina eurais už apmokamą km — kaina, žemiau kurios dirbama nuostolingai (#127). */
  costPerKm: number | null;
}

/** Grupės, pelningiausia viršuje. Vienodo pelno atveju — pagal raktą. */
export function groupProfit(
  trips: TripSummary[],
  keyOf: (trip: TripSummary) => string,
): ProfitGroup[] {
  const groups = new Map<string, ProfitGroup>();

  for (const trip of trips) {
    const key = keyOf(trip);
    const group = groups.get(key) ?? {
      key,
      tripCount: 0,
      paidKm: 0,
      revenueCents: 0,
      totalCostCents: 0,
      profitCents: 0,
      marginPercent: null,
      profitPerKm: null,
      costPerKm: null,
    };

    group.tripCount += 1;
    group.paidKm += trip.paidKm;
    group.revenueCents += trip.revenueCents;
    group.totalCostCents += trip.totalCostCents;
    group.profitCents += trip.profitCents;

    groups.set(key, group);
  }

  for (const group of groups.values()) {
    group.marginPercent =
      group.revenueCents > 0 ? (group.profitCents / group.revenueCents) * 100 : null;
    group.profitPerKm = group.paidKm > 0 ? group.profitCents / 100 / group.paidKm : null;
    group.costPerKm = group.paidKm > 0 ? group.totalCostCents / 100 / group.paidKm : null;
  }

  return [...groups.values()].sort(
    (a, b) => b.profitCents - a.profitCents || a.key.localeCompare(b.key),
  );
}
