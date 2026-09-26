/**
 * Mėnesių eiga (#131).
 *
 * Suvestinė lygina du laikotarpius (#113), bet vienas palyginimas nerodo krypties:
 * ar rugsėjis geresnis už rugpjūtį, dar nereiškia, kad metai gerėja. Vežėjui
 * svarbu matyti eilę — kada marža pradėjo kristi ir ar tai jau trečias mėnuo.
 *
 * Mėnesiai be reisų lieka eilutėse tušti, o ne praleidžiami: prastovos yra
 * faktas, ir lentelėje jos turi matytis tokios, kokios yra.
 */

import type { TripSummary } from "./trips";

export interface MonthStats {
  /** „2026-09“. */
  month: string;
  tripCount: number;
  paidKm: number;
  revenueCents: number;
  totalCostCents: number;
  profitCents: number;
  /** Pelnas / pajamos. `null`, kai pajamų nebuvo. */
  marginPercent: number | null;
  /** Savikaina eurais už apmokamą km. `null`, kai km nebuvo. */
  costPerKm: number | null;
}

/** Mėnuo, nuo kurio prasideda reiso data. */
export function tripMonth(tripDate: string): string {
  return tripDate.slice(0, 7);
}

/**
 * Paskutiniai `count` mėnesių, seniausias pirmas.
 *
 * Skaičiuojama per bendrą mėnesių numeraciją, kad nereikėtų atskirai gaudyti
 * persivertimo į praėjusius metus.
 */
export function recentMonths(today: string, count: number): string[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (!Number.isInteger(year) || !Number.isInteger(month) || count < 1) return [];

  const total = year * 12 + (month - 1);

  return Array.from({ length: count }, (_, index) => {
    const value = total - (count - 1 - index);
    const monthYear = Math.floor(value / 12);
    const monthNumber = (value % 12) + 1;
    return `${monthYear}-${String(monthNumber).padStart(2, "0")}`;
  });
}

/** Mėnesių eilė su sumomis. Mėnesiai be reisų grąžinami su nuliais. */
export function monthlyStats(
  trips: TripSummary[],
  today: string,
  count = 12,
): MonthStats[] {
  const byMonth = new Map<string, TripSummary[]>();

  for (const trip of trips) {
    const month = tripMonth(trip.tripDate);
    const rows = byMonth.get(month) ?? [];
    rows.push(trip);
    byMonth.set(month, rows);
  }

  return recentMonths(today, count).map((month) => {
    const rows = byMonth.get(month) ?? [];
    const sum = (pick: (trip: TripSummary) => number) =>
      rows.reduce((total, trip) => total + pick(trip), 0);

    const revenueCents = sum((trip) => trip.revenueCents);
    const totalCostCents = sum((trip) => trip.totalCostCents);
    const profitCents = sum((trip) => trip.profitCents);
    const paidKm = sum((trip) => trip.paidKm);

    return {
      month,
      tripCount: rows.length,
      paidKm,
      revenueCents,
      totalCostCents,
      profitCents,
      marginPercent: revenueCents > 0 ? (profitCents / revenueCents) * 100 : null,
      costPerKm: paidKm > 0 ? totalCostCents / 100 / paidKm : null,
    };
  });
}

/** Didžiausias mėnesio pelnas arba nuostolis — juostelių aukščiui. */
export function peakProfitCents(months: MonthStats[]): number {
  return months.reduce((peak, month) => Math.max(peak, Math.abs(month.profitCents)), 0);
}
