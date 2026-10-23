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

import { calcProfitPerDay } from "./calc";
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
  /** Furų paros, kurias užėmė grupės reisai. */
  days: number;
  /** Pelnas centais per furos parą (#179). `null`, kai parų nėra. */
  profitPerDayCents: number | null;
  /** Pajamos eurais už apmokamą km – tuo deramasi su užsakovu. `null`, kai km nėra. */
  revenuePerKm: number | null;
  /**
   * Reisų normų l/100 km, sverta ridos. Tik reisams, kurių litrai žinomi;
   * `null`, kai tokių nėra.
   */
  litresPer100Km: number | null;
}

/** Grupės, pelningiausia viršuje. Vienodo pelno atveju — pagal raktą. */
export function groupProfit(
  trips: TripSummary[],
  keyOf: (trip: TripSummary) => string,
): ProfitGroup[] {
  const groups = new Map<string, ProfitGroup>();
  // Litrai ir jų km atskirai: be litrų reisas l/100 nesumažintų.
  const fuel = new Map<string, { litres: number; km: number }>();

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
      days: 0,
      profitPerDayCents: null,
      revenuePerKm: null,
      litresPer100Km: null,
    };

    if (trip.fuelLitres !== undefined) {
      const used = fuel.get(key) ?? { litres: 0, km: 0 };
      used.litres += trip.fuelLitres;
      used.km += trip.paidKm + trip.emptyKm;
      fuel.set(key, used);
    }

    group.tripCount += 1;
    group.paidKm += trip.paidKm;
    group.days += trip.days;
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
    group.profitPerDayCents = calcProfitPerDay(group.profitCents, group.days);
    group.revenuePerKm = group.paidKm > 0 ? group.revenueCents / 100 / group.paidKm : null;
    const used = fuel.get(group.key);
    group.litresPer100Km = used && used.km > 0 ? (used.litres / used.km) * 100 : null;
  }

  return [...groups.values()].sort(
    (a, b) => b.profitCents - a.profitCents || a.key.localeCompare(b.key),
  );
}
