/**
 * Eiga pagal savaites, kaip Power BI „Pelno analizė“: keli rodikliai po vieną
 * mažą grafiką. Mėnuo per ilgas pastebėti, kad kuro norma ar pelnas per parą
 * pradėjo slysti – savaitė parodo tai po 1–2 savaičių, ne po mėnesio.
 *
 * Reisas priskiriamas savaitei, kurią prasideda, kaip ir mėnesių eigoje.
 * Savaitės be reisų lieka eilėje su `null`, ne praleidžiamos.
 */

import { addDays } from "./trip-progress";
import type { TripSummary } from "./trips";

/** Pirmadienis, kurio savaitei priklauso data. */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

export interface WeekTotals {
  /** Savaitės pirmadienis. */
  week: string;
  tripCount: number;
  days: number;
  paidKm: number;
  /** Apmokami ir tušti km. */
  km: number;
  revenueCents: number;
  profitCents: number;
  fuelCents: number;
  fuelLitres: number;
  roadsCents: number;
  repairsCents: number;
  /** Kas mokama už parą, nesvarbu, kiek važiuota: vairuotojai, fura, valdymas, priekaba. */
  fixedCents: number;
}

const SUMS = ["tripCount", "days", "paidKm", "km", "revenueCents", "profitCents", "fuelCents", "fuelLitres", "roadsCents", "repairsCents", "fixedCents"] as const;

function emptyWeek(week: string): WeekTotals {
  return { week, ...Object.fromEntries(SUMS.map((key) => [key, 0])) } as WeekTotals;
}

/** Paskutinės `count` savaičių iki `today` imtinai, seniausia pirma. */
export function weeklyTotals(trips: TripSummary[], today: string, count: number): WeekTotals[] {
  const last = weekStart(today);
  const weeks = Array.from({ length: count }, (_, index) => addDays(last, -7 * (count - 1 - index)));
  const byWeek = new Map(weeks.map((week) => [week, emptyWeek(week)]));

  for (const trip of trips) {
    const row = byWeek.get(weekStart(trip.tripDate));
    if (!row) continue;
    row.tripCount += 1;
    row.days += trip.days;
    row.paidKm += trip.paidKm;
    row.km += trip.paidKm + trip.emptyKm;
    row.revenueCents += trip.revenueCents;
    row.profitCents += trip.profitCents;
    row.fuelLitres += trip.fuelLitres ?? 0;
    if (trip.costs) {
      row.fuelCents += trip.costs.fuel;
      row.roadsCents += trip.costs.roads;
      row.repairsCents += trip.costs.repairs;
      row.fixedCents += trip.costs.drivers + trip.costs.perDiem + trip.costs.truck + trip.costs.management + trip.costs.trailer;
    }
  }
  return weeks.map((week) => byWeek.get(week)!);
}

const ratio = (top: number, bottom: number) => (bottom > 0 ? top / bottom : null);

export interface WeeklyMetric {
  key: string;
  label: string;
  /** Vienetas po skaičiaus. */
  unit: string;
  digits: number;
  /** Ar didesnė reikšmė geriau – nuo to priklauso spalva lyginant su vidurkiu. */
  higherIsBetter: boolean;
  value: (week: WeekTotals) => number | null;
}

/** Eurais, ne centais: grafike rodomas jau suapvalintas skaičius. */
export const WEEKLY_METRICS: WeeklyMetric[] = [
  { key: "kmPerDay", label: "Km per parą", unit: "km", digits: 0, higherIsBetter: true, value: (w) => ratio(w.km, w.days) },
  { key: "profitPerDay", label: "Pelnas per parą", unit: "€", digits: 0, higherIsBetter: true, value: (w) => ratio(w.profitCents / 100, w.days) },
  { key: "revenuePerKm", label: "Pajamos už km", unit: "€/km", digits: 2, higherIsBetter: true, value: (w) => ratio(w.revenueCents / 100, w.paidKm) },
  { key: "fixedPerDay", label: "Pastovūs kaštai per parą", unit: "€", digits: 0, higherIsBetter: false, value: (w) => ratio(w.fixedCents / 100, w.days) },
  { key: "fuelPrice", label: "Kuro kaina", unit: "€/l", digits: 3, higherIsBetter: false, value: (w) => ratio(w.fuelCents / 100, w.fuelLitres) },
  { key: "litresPer100", label: "Kuro sąnaudos", unit: "l/100", digits: 1, higherIsBetter: false, value: (w) => ratio(w.fuelLitres * 100, w.km) },
  { key: "roadsPerKm", label: "Keliai už km", unit: "€/km", digits: 3, higherIsBetter: false, value: (w) => ratio(w.roadsCents / 100, w.km) },
  { key: "repairsPerKm", label: "Remontas už km", unit: "€/km", digits: 3, higherIsBetter: false, value: (w) => ratio(w.repairsCents / 100, w.km) },
];

/**
 * Viso laikotarpio reikšmė – iš sumų, ne savaičių vidurkis: savaitė su vienu
 * trumpu reisu kitaip svertų tiek pat, kiek savaitė su dvidešimt.
 */
export function periodValue(metric: WeeklyMetric, weeks: WeekTotals[]): number | null {
  const total = emptyWeek("");
  for (const week of weeks) for (const key of SUMS) total[key] += week[key];
  return metric.value(total);
}
