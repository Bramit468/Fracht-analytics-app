/**
 * Ar šis laikotarpis geresnis už praėjusį (#113).
 *
 * Laikotarpio filtras (#103) atsako „kiek uždirbome rugsėjį“, bet ne „ar tai
 * daugiau nei rugpjūtį“. Vienas skaičius be atskaitos taško nieko nesako:
 * 12 400 € pelno yra gerai arba blogai, priklausomai nuo to, kiek buvo prieš.
 */

import { calculateDashboardStats, type DashboardStats } from "./dashboard";
import { filterByRange, previousPeriodRange, type PeriodKey } from "./trip-period";
import type { TripSummary } from "./trips";

export interface Change {
  /** Skirtumas procentais. `null`, kai palyginti nėra su kuo. */
  percent: number | null;
  /** Skirtumas tais pačiais vienetais, kaip ir pats dydis. */
  difference: number;
}

export interface PeriodComparison {
  previous: DashboardStats;
  revenue: Change;
  profit: Change;
  tripCount: Change;
  /** Marža ir €/km — skirtumas punktais, procentų čia neskaičiuojame. */
  marginPoints: number | null;
  profitPerKm: number | null;
}

/**
 * Pokytis nuo praėjusios reikšmės.
 *
 * Dalijama iš modulio: nuostolis nuo −1 000 € iki −500 € yra **pagerėjimas**
 * 50 %, o ne pablogėjimas. Kai prieš tai buvo nulis, procento nėra — bet koks
 * skaičius nuo nulio būtų begalybė, o ne „+100 %“.
 */
export function change(current: number, previous: number): Change {
  return {
    percent: previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100,
    difference: current - previous,
  };
}

/** `null`, kai palyginimo laikotarpio nėra arba jame nebuvo nė vieno reiso. */
export function comparePeriod(
  trips: TripSummary[],
  key: PeriodKey,
  today: string,
  current: DashboardStats,
): PeriodComparison | null {
  const range = previousPeriodRange(key, today);
  if (range === null) return null;

  const earlier = filterByRange(trips, range);
  // Tuščias praėjęs mėnuo nėra nulis: tada palyginimo tiesiog nėra, ir rodyti
  // „+100 %“ reikštų sugalvotą pagerėjimą.
  if (earlier.length === 0) return null;

  const previous = calculateDashboardStats(earlier);

  return {
    previous,
    revenue: change(current.revenueCents, previous.revenueCents),
    profit: change(current.profitCents, previous.profitCents),
    tripCount: change(current.tripCount, previous.tripCount),
    marginPoints:
      current.marginPercent === null || previous.marginPercent === null
        ? null
        : current.marginPercent - previous.marginPercent,
    profitPerKm:
      current.profitPerKm === null || previous.profitPerKm === null
        ? null
        : current.profitPerKm - previous.profitPerKm,
  };
}
