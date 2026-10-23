/**
 * Planas ir faktas visam laikotarpiui, pagal furą.
 *
 * Reiso puslapis lygina vieną reisą su visa fura per jo dienas, todėl du
 * vienu metu vežami reisai gauna tuos pačius kaštus (#59). Čia lyginama
 * fura: planas – jos reisų suma, faktas – jos išlaidos tik reisų dienomis,
 * kiekviena diena vieną kartą. Dienos be reisų (stovėjimas, remontas)
 * neįeina, nes plane jų taip pat nėra.
 */

import { plateKey, type DailyDistance, type Supply } from "./telematics-costs";
import { addDays } from "./trip-progress";
import type { TripSummary } from "./trips";

export interface TripSpan {
  plate: string;
  from: string;
  to: string;
}

/** Reiso dienos. Trupmeninė paskutinė para (importas) irgi yra diena. */
export function tripSpan(trip: Pick<TripSummary, "truckPlate" | "tripDate" | "days">): TripSpan {
  return { plate: trip.truckPlate, from: trip.tripDate, to: addDays(trip.tripDate, Math.max(0, Math.ceil(trip.days) - 1)) };
}

/** Kurias dienas Telematika turi. Už jų ribų faktas būtų per mažas, ne nulis. */
export interface Coverage {
  from: string;
  to: string;
}

export function telematicsCoverage(daily: DailyDistance[]): Coverage | null {
  if (!daily.length) return null;
  let from = daily[0].date;
  let to = daily[0].date;
  for (const { date } of daily) {
    if (date < from) from = date;
    if (date > to) to = date;
  }
  return { from, to };
}

/** Ilgesnis „reisas“ – rašybos klaida, ne kelionė: jo dienos fakto neiškreips. */
export const MAX_SPAN_DAYS = 62;

/**
 * Ar reisą galima lyginti: visos jo dienos patenka į Telematikos duomenis.
 * Tą pačią taisyklę taiko ir serveris, ir naršyklė – kitaip planas ir faktas
 * apimtų skirtingus reisus.
 */
export function isCovered(span: TripSpan, coverage: Coverage): boolean {
  return span.from >= coverage.from && span.to <= coverage.to
    && Date.parse(span.to) - Date.parse(span.from) <= MAX_SPAN_DAYS * 86_400_000;
}

export interface SpanActuals {
  plate: string;
  km: number;
  fuelL: number;
  /** Km tik tų dienų, kai kuro daviklis veikė – kitaip l/100 būtų per mažas. */
  fuelKm: number;
  fuelCents: number;
  adblueCents: number;
  roadCents: number;
}

/** Faktas pagal furą tik reisų dienomis. Persidengiančių reisų diena skaičiuojama kartą. */
export function actualsOverSpans(daily: DailyDistance[], supplies: Supply[], spans: TripSpan[]): SpanActuals[] {
  const days = new Set<string>();
  for (const span of spans) {
    for (let date = span.from; date <= span.to;) {
      days.add(`${plateKey(span.plate)}|${date}`);
      const next = addDays(date, 1);
      if (next <= date) break;
      date = next;
    }
  }

  const totals = new Map<string, SpanActuals>();
  const row = (plate: string) => {
    const key = plateKey(plate);
    let current = totals.get(key);
    if (!current) {
      current = { plate, km: 0, fuelL: 0, fuelKm: 0, fuelCents: 0, adblueCents: 0, roadCents: 0 };
      totals.set(key, current);
    }
    return current;
  };
  const wanted = (row: { plate: string; date: string }) => days.has(`${plateKey(row.plate)}|${row.date}`);

  for (const day of daily.filter(wanted)) {
    const current = row(day.plate);
    current.km += day.km;
    if (day.fuelL !== null) {
      current.fuelL += day.fuelL;
      current.fuelKm += day.km;
    }
  }
  for (const supply of supplies.filter(wanted)) {
    const current = row(supply.plate);
    if (supply.kind === "diesel") current.fuelCents += supply.costCents;
    if (supply.kind === "adblue") current.adblueCents += supply.costCents;
    if (supply.kind === "toll") current.roadCents += supply.costCents;
  }
  return [...totals.values()];
}

export interface CostPair {
  fuelCents: number;
  adblueCents: number;
  roadCents: number;
}

export interface PlanActualRow {
  plate: string;
  tripCount: number;
  plannedKm: number;
  actualKm: number;
  planned: CostPair;
  actual: CostPair;
  /** Faktas minus planas. Teigiamas – brangiau, nei skaičiuota. */
  diffCents: number;
  /** `null`, kai kuro daviklio duomenų nėra. */
  actualLitresPer100Km: number | null;
}

const costSum = (pair: CostPair) => pair.fuelCents + pair.adblueCents + pair.roadCents;

/**
 * Planas prieš faktą pagal furą, blogiausia viršuje. Furos be jokių
 * Telematikos duomenų grąžinamos atskirai: nulinis faktas atrodytų kaip
 * didžiulis sutaupymas.
 */
export function planVsActual(trips: TripSummary[], actuals: SpanActuals[]): { rows: PlanActualRow[]; total: PlanActualRow; missing: string[] } {
  const actualByKey = new Map(actuals.map((row) => [plateKey(row.plate), row]));
  const byKey = new Map<string, PlanActualRow & { fuelL: number; fuelKm: number }>();
  const missing = new Set<string>();

  for (const trip of trips) {
    if (!trip.costs) continue;
    const key = plateKey(trip.truckPlate);
    const actual = actualByKey.get(key);
    if (!actual || (actual.km === 0 && actual.fuelCents + actual.adblueCents + actual.roadCents === 0)) {
      missing.add(trip.truckPlate);
      continue;
    }
    let current = byKey.get(key);
    if (!current) {
      current = {
        plate: trip.truckPlate, tripCount: 0, plannedKm: 0, actualKm: actual.km,
        planned: { fuelCents: 0, adblueCents: 0, roadCents: 0 },
        actual: { fuelCents: actual.fuelCents, adblueCents: actual.adblueCents, roadCents: actual.roadCents },
        diffCents: 0, actualLitresPer100Km: null, fuelL: actual.fuelL, fuelKm: actual.fuelKm,
      };
      byKey.set(key, current);
    }
    current.tripCount += 1;
    current.plannedKm += trip.paidKm + trip.emptyKm;
    current.planned.fuelCents += trip.costs.fuel;
    current.planned.adblueCents += trip.costs.adblue;
    current.planned.roadCents += trip.costs.roads;
  }

  const finish = (row: PlanActualRow & { fuelL: number; fuelKm: number }): PlanActualRow => {
    const { fuelL, fuelKm, ...rest } = row;
    return { ...rest, diffCents: costSum(row.actual) - costSum(row.planned), actualLitresPer100Km: fuelKm > 0 ? (fuelL / fuelKm) * 100 : null };
  };
  const rows = [...byKey.values()];
  const add = (pick: (row: PlanActualRow & { fuelL: number; fuelKm: number }) => number) => rows.reduce((sum, row) => sum + pick(row), 0);
  const total = finish({
    plate: "Iš viso", tripCount: add((row) => row.tripCount), plannedKm: add((row) => row.plannedKm), actualKm: add((row) => row.actualKm),
    planned: { fuelCents: add((row) => row.planned.fuelCents), adblueCents: add((row) => row.planned.adblueCents), roadCents: add((row) => row.planned.roadCents) },
    actual: { fuelCents: add((row) => row.actual.fuelCents), adblueCents: add((row) => row.actual.adblueCents), roadCents: add((row) => row.actual.roadCents) },
    diffCents: 0, actualLitresPer100Km: null, fuelL: add((row) => row.fuelL), fuelKm: add((row) => row.fuelKm),
  });

  return {
    rows: rows.map(finish).sort((a, b) => b.diffCents - a.diffCents || a.plate.localeCompare(b.plate)),
    total,
    missing: [...missing].sort(),
  };
}
