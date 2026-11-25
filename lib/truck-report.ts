/**
 * Furos ataskaita: reisų rezultatas, palygintas su tuo, kas iš tikrųjų sumokėta
 * (vartotojo sprendimas, 2026-11-19).
 *
 * Reisas vertinamas tik savo paromis (prastova prieš pakrovimą jam nepriskiriama),
 * todėl tikras furos rezultatas matomas tik čia: pajamos − reisų kuras, AdBlue,
 * keliai − faktiniai mėnesio kaštai (Furos → Faktiniai kaštai, 0029) už visas
 * kalendorines dienas, ir su prastovomis.
 */

import { addDays } from "./trip-progress";
import { daysInMonth, monthCostTotal, type MonthCostRow } from "./truck-month-costs";
import { plateKey } from "./telematics-costs";
import type { TripSummary } from "./trips";

export interface TruckReportRow {
  plate: string;
  tripCount: number;
  revenueCents: number;
  /** Reisų kuras, AdBlue ir keliai – tai, ko faktiniuose kaštuose nėra. */
  directCents: number;
  /** Pajamos − tiesioginiai kaštai. */
  grossCents: number;
  /** Reisų „Pelnas“ suma (pagal furos normas, tik krovinių paromis). */
  tripProfitCents: number;
  /** Faktiniai kaštai, padalinti laikotarpio dienoms; `null` – trūksta mėnesio. */
  actualCents: number | null;
  missingMonths: string[];
  /** Bendroji marža − faktiniai kaštai. */
  realProfitCents: number | null;
  calendarDays: number;
  loadDays: number;
  idleDays: number;
  /** Prastovos dienos × faktiniai kaštai per kalendorinę dieną. */
  idleCostCents: number | null;
  /**
   * Odometro rida, kurios nepaaiškina joks krovinys (savaitgalis, bazė, servisas):
   * paros rida − reisų km (apmokami + tušti). `null` – paros ridos nėra.
   */
  kmWithoutLoad: number | null;
  /** Jų kuras ir AdBlue pagal tos furos reisų vidutinę kainą už km; atimama iš realaus pelno. */
  kmWithoutLoadCents: number | null;
  utilizationPercent: number | null;
  realProfitPerDayCents: number | null;
}

/** Kalendorinės dienos nuo–iki imtinai. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/**
 * Faktiniai kaštai laikotarpiui: kiekvieno mėnesio suma × laikotarpio dienos
 * tame mėnesyje / mėnesio dienos. Savaitei – jos dienų dalis.
 */
export function proratedActualCents(rows: MonthCostRow[], from: string, to: string): { cents: number; missing: string[] } {
  const byMonth = new Map(rows.map((row) => [row.month, monthCostTotal(row)]));
  let cents = 0;
  const missing: string[] = [];
  for (let month = `${from.slice(0, 7)}-01`; month <= to; month = addDays(month, daysInMonth(month))) {
    const monthEnd = addDays(month, daysInMonth(month) - 1);
    const overlap = daysBetween(from > month ? from : month, to < monthEnd ? to : monthEnd);
    const total = byMonth.get(month);
    if (total === undefined) missing.push(month.slice(0, 7));
    else cents += (total * overlap) / daysInMonth(month);
  }
  return { cents: Math.round(cents), missing };
}

/**
 * Viena eilutė kiekvienai furai, turinčiai reisų ar įvestų kaštų laikotarpyje.
 * `trips` – jau atrinkti laikotarpiui. Krovinio paros – reisų parų suma
 * (ponytail: reisas, kertantis laikotarpio ribą, įskaitomas visas).
 */
export function truckReport(input: {
  plates: string[];
  trips: TripSummary[];
  monthCosts: (MonthCostRow & { plate: string })[];
  /** Telematikos paros rida (archyvas). */
  dailyKm?: { plate: string; date: string; km: number }[];
  from: string;
  to: string;
}): TruckReportRow[] {
  const calendarDays = Math.max(1, daysBetween(input.from, input.to));
  const rows: TruckReportRow[] = [];
  for (const plate of input.plates) {
    const key = plateKey(plate);
    const trips = input.trips.filter((trip) => plateKey(trip.truckPlate) === key);
    const costs = input.monthCosts.filter((row) => plateKey(row.plate) === key);
    if (trips.length === 0 && costs.length === 0) continue;

    const revenueCents = trips.reduce((sum, trip) => sum + trip.revenueCents, 0);
    const directCents = Math.round(trips.reduce((sum, trip) => sum + (trip.costs ? trip.costs.fuel + trip.costs.adblue + trip.costs.roads : 0), 0));
    const grossCents = revenueCents - directCents;
    const tripProfitCents = trips.reduce((sum, trip) => sum + trip.profitCents, 0);
    const loadDays = Math.min(calendarDays, Math.round(trips.reduce((sum, trip) => sum + trip.days, 0) * 100) / 100);
    const idleDays = Math.round((calendarDays - loadDays) * 100) / 100;
    const actual = proratedActualCents(costs, input.from, input.to);
    const known = actual.missing.length === 0;

    // Važiavimas be krovinio: jo kuro reisai nemoka, bet jis sumokėtas.
    const days = (input.dailyKm ?? []).filter((day) => plateKey(day.plate) === key && day.date >= input.from && day.date <= input.to);
    const tripKm = trips.reduce((sum, trip) => sum + trip.paidKm + trip.emptyKm, 0);
    const fuelCents = trips.reduce((sum, trip) => sum + (trip.costs ? trip.costs.fuel + trip.costs.adblue : 0), 0);
    const kmWithoutLoad = days.length > 0 ? Math.max(0, Math.round(days.reduce((sum, day) => sum + day.km, 0) - tripKm)) : null;
    const kmWithoutLoadCents = kmWithoutLoad === null ? null : tripKm > 0 ? Math.round((kmWithoutLoad * fuelCents) / tripKm) : 0;
    const realProfitCents = known ? grossCents - actual.cents - (kmWithoutLoadCents ?? 0) : null;

    rows.push({
      plate,
      tripCount: trips.length,
      revenueCents,
      directCents,
      grossCents,
      tripProfitCents,
      actualCents: known ? actual.cents : null,
      missingMonths: actual.missing,
      realProfitCents,
      calendarDays,
      loadDays,
      idleDays,
      idleCostCents: known ? Math.round((idleDays * actual.cents) / calendarDays) : null,
      kmWithoutLoad,
      kmWithoutLoadCents,
      utilizationPercent: (loadDays / calendarDays) * 100,
      realProfitPerDayCents: realProfitCents === null ? null : Math.round(realProfitCents / calendarDays),
    });
  }
  return rows.sort((a, b) => (a.realProfitCents ?? Infinity) - (b.realProfitCents ?? Infinity) || a.plate.localeCompare(b.plate));
}
