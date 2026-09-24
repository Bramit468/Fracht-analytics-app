/**
 * Reisų sąrašo paieška, atranka ir rikiavimas (#105).
 *
 * Po importo iš Excel sąraše gali būti šimtai reisų, o vienintelis būdas rasti
 * konkretų buvo slinkti žemyn. Klausimai, į kuriuos sąrašas turi atsakyti, yra
 * paprasti: „kur tas reisas“, „ką vežė ta fura“ ir „kurie reisai nuostolingi“.
 */

import { filterByPeriod, type PeriodKey } from "./trip-period";
import type { TripSummary } from "./trips";

export type SortKey = "date" | "profit" | "margin";

export const SORTS: { key: SortKey; label: string }[] = [
  { key: "date", label: "Naujausi" },
  { key: "profit", label: "Pelningiausi" },
  { key: "margin", label: "Didžiausia marža" },
];

export interface TripFilter {
  /** Reiso numeris, miestas arba furos numeris. */
  query: string;
  /** Furos numeris arba "" — visos. */
  plate: string;
  period: PeriodKey;
}

export const EMPTY_FILTER: TripFilter = { query: "", plate: "", period: "all" };

/**
 * Be diakritikos ir mažosiomis.
 *
 * Kitaip „panevezys“ nerastų „Panevėžys“, o būtent taip ir rašoma skubant.
 */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Furų numeriai, pasitaikantys reisuose. Sąrašui su pasirinkimu. */
export function tripPlates(trips: TripSummary[]): string[] {
  return [...new Set(trips.map((trip) => trip.truckPlate))].sort((a, b) => a.localeCompare(b));
}

function matches(trip: TripSummary, query: string): boolean {
  const needle = fold(query.trim());
  if (needle === "") return true;

  return fold(
    `${trip.tripNumber} ${trip.origin} ${trip.destination} ${trip.truckPlate}`,
  ).includes(needle);
}

export function filterTrips(
  trips: TripSummary[],
  filter: TripFilter,
  today: string,
): TripSummary[] {
  return filterByPeriod(trips, filter.period, today).filter(
    (trip) =>
      (filter.plate === "" || trip.truckPlate === filter.plate) && matches(trip, filter.query),
  );
}

/**
 * Rikiavimas. Pradinio sąrašo nekeičia.
 *
 * Reisai be maržos (nulinės pajamos) atsiduria gale: jie nėra nei geri, nei
 * blogi — tiesiog dydžio nėra, ir sąrašo viršuje jie tik trukdytų.
 */
export function sortTrips(trips: TripSummary[], key: SortKey): TripSummary[] {
  const sorted = [...trips];

  switch (key) {
    case "date":
      return sorted.sort(
        (a, b) => b.tripDate.localeCompare(a.tripDate) || a.tripNumber.localeCompare(b.tripNumber),
      );
    case "profit":
      return sorted.sort(
        (a, b) => b.profitCents - a.profitCents || a.tripNumber.localeCompare(b.tripNumber),
      );
    case "margin":
      return sorted.sort((a, b) => {
        if (a.marginPercent === null && b.marginPercent === null) {
          return a.tripNumber.localeCompare(b.tripNumber);
        }
        if (a.marginPercent === null) return 1;
        if (b.marginPercent === null) return -1;
        return b.marginPercent - a.marginPercent || a.tripNumber.localeCompare(b.tripNumber);
      });
  }
}
