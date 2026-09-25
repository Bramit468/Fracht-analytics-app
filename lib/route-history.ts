/**
 * Kiek ta pati kryptis nešė anksčiau (#109).
 *
 * „Kiek prašyti“ iki šiol atsakydavo tik iš kaštų ir norimos maržos. Bet marža
 * įrašoma iš galvos, o tikroji riba yra kita: kiek už tą kryptį realiai moka.
 * Istorija tą ir parodo — ne tam, kad kainą nustatytų, o kad matytum, ar dabar
 * prašai daugiau, ar mažiau nei praeitą kartą.
 *
 * Imama mediana, ne vidurkis: vienas keistas reisas (tuščias grįžimas, avarinis
 * krovinys) vidurkį patraukia, o medianos — ne.
 */

import { routeKey } from "./route-profit";
import type { TripSummary } from "./trips";

export interface RouteHistory {
  /** `route` – ta pati kryptis; `destination` – tik ta pati atvykimo vieta. */
  matchType: "route" | "destination";
  tripCount: number;
  medianRevenueCents: number;
  lowestRevenueCents: number;
  highestRevenueCents: number;
  /** `null`, kai nė viename reise nėra apmokamų km. */
  medianPricePerKm: number | null;
  /** `null`, kai nė viename reise nebuvo pajamų. */
  medianMarginPercent: number | null;
  /** Vėliausio tokios krypties reiso data. */
  lastTripDate: string;
}

/** Vidurinė reikšmė; lyginiam kiekiui – dviejų vidurinių vidurkis. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarize(trips: TripSummary[], matchType: RouteHistory["matchType"]): RouteHistory {
  const revenues = trips.map((trip) => trip.revenueCents);
  const perKm = trips
    .filter((trip) => trip.paidKm > 0)
    .map((trip) => trip.revenueCents / 100 / trip.paidKm);
  const margins = trips
    .map((trip) => trip.marginPercent)
    .filter((value): value is number => value !== null);

  return {
    matchType,
    tripCount: trips.length,
    medianRevenueCents: Math.round(median(revenues) ?? 0),
    lowestRevenueCents: Math.min(...revenues),
    highestRevenueCents: Math.max(...revenues),
    medianPricePerKm: median(perKm),
    medianMarginPercent: median(margins),
    lastTripDate: trips.reduce(
      (latest, trip) => (trip.tripDate > latest ? trip.tripDate : latest),
      trips[0].tripDate,
    ),
  };
}

/**
 * Tos pačios krypties istorija, o jos neradus — tos pačios atvykimo vietos.
 *
 * Antrasis variantas silpnesnis, bet naudingesnis už tylą: važiuojant į Oslą
 * pirmą kartą iš Kauno, kitų reisų į Oslą kainos vis tiek yra atskaitos taškas.
 * Kuris variantas panaudotas, matyti iš `matchType` — spėjimas neturi atrodyti
 * kaip tikslus atsakymas.
 */
export function routeHistory(
  trips: TripSummary[],
  origin: string,
  destination: string,
  excludeId?: string,
): RouteHistory | null {
  if (destination.trim() === "") return null;

  const others = excludeId ? trips.filter((trip) => trip.id !== excludeId) : trips;
  const wanted = routeKey(origin, destination);

  const sameRoute = others.filter(
    (trip) => routeKey(trip.origin, trip.destination) === wanted,
  );
  if (sameRoute.length > 0) return summarize(sameRoute, "route");

  // Kryptis lyginama tuo pačiu būdu kaip ir visur: be didžiųjų ir be ženklų.
  const wantedDestination = routeKey("", destination);
  const sameDestination = others.filter(
    (trip) => routeKey("", trip.destination) === wantedDestination,
  );

  return sameDestination.length > 0 ? summarize(sameDestination, "destination") : null;
}
