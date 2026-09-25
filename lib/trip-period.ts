/**
 * Suvestinės laikotarpis (#103).
 *
 * Iki šiol visi skaičiai buvo „nuo pat pradžių“, todėl blogas mėnuo pasislėpdavo
 * už gero pusmečio, o pagerėjimo nesimatydavo visai. Vežėjui svarbus klausimas
 * yra ne „kiek uždirbome iš viso“, o „ar šis mėnuo geresnis už praėjusį“.
 *
 * Ribos skaičiuojamos iš datos teksto (`2026-09-24`), o ne iš `Date` objekto su
 * laiko juosta: reisų datos yra dienos be valandų, ir taip jos ir turi likti.
 */

import type { TripSummary } from "./trips";

export type PeriodKey = "month" | "previousMonth" | "year" | "all";

export interface PeriodRange {
  /** Nuo, imtinai. */
  from: string;
  /** Iki, imtinai. */
  to: string;
}

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "month", label: "Šis mėnuo" },
  { key: "previousMonth", label: "Praėjęs mėnuo" },
  { key: "year", label: "Šie metai" },
  { key: "all", label: "Visi" },
];

/** Mėnesio pirma ir paskutinė diena. `month` — nuo 1 iki 12. */
function monthRange(year: number, month: number): PeriodRange {
  // Kito mėnesio nulinė diena yra šio mėnesio paskutinė — taip nereikia žinoti
  // nei mėnesio ilgio, nei keliamųjų metų.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");

  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** Laikotarpio ribos. `null` reiškia „visi reisai“, be ribų. */
export function periodRange(key: PeriodKey, today: string): PeriodRange | null {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  switch (key) {
    case "month":
      return monthRange(year, month);
    case "previousMonth":
      // Sausio praėjęs mėnuo yra praėjusių metų gruodis.
      return month === 1 ? monthRange(year - 1, 12) : monthRange(year, month - 1);
    case "year":
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    case "all":
      return null;
  }
}

/**
 * Prieš tai ėjęs toks pat laikotarpis — palyginimui (#113).
 *
 * „Visiems“ jo nėra: prieš visą istoriją nieko nebuvo.
 */
export function previousPeriodRange(key: PeriodKey, today: string): PeriodRange | null {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  // Mėnuo skaičiuojamas per bendrą numeraciją, kad nereikėtų atskirai gaudyti
  // sausio ir vasario persivertimo į praėjusius metus.
  const shiftMonths = (back: number): PeriodRange => {
    const total = year * 12 + (month - 1) - back;
    return monthRange(Math.floor(total / 12), (total % 12) + 1);
  };

  switch (key) {
    case "month":
      return shiftMonths(1);
    case "previousMonth":
      return shiftMonths(2);
    case "year":
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
    case "all":
      return null;
  }
}

/** Reisai, patenkantys į ribas. Ribos imtinės. */
export function filterByRange(trips: TripSummary[], range: PeriodRange): TripSummary[] {
  return trips.filter((trip) => trip.tripDate >= range.from && trip.tripDate <= range.to);
}

/** Reisai, patenkantys į laikotarpį. Ribos imtinės. */
export function filterByPeriod(
  trips: TripSummary[],
  key: PeriodKey,
  today: string,
): TripSummary[] {
  const range = periodRange(key, today);
  return range === null ? trips : filterByRange(trips, range);
}
