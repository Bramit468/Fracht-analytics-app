/**
 * Pelningumas pagal kryptį (#107).
 *
 * Pagal furą jau matyti, kas neša pinigus, bet fura veža ten, kur ją siunčia.
 * Realus klausimas yra kitas: **kurios kryptys apsimoka**. Nuostolinga kryptis
 * atrodo kaip bloga fura, nors kalta ne fura, o kaina toje pusėje.
 *
 * Kryptys lyginamos be didžiųjų raidžių ir be lietuviškų ženklų: „Panevėžys →
 * Oslas“ ir „panevezys → oslas“ yra ta pati kryptis, o sąraše jos suskiltų į dvi
 * ir abi atrodytų dvigubai mažesnės, nei yra.
 */

import { groupProfit, type ProfitGroup } from "./group-profit";
import type { TripSummary } from "./trips";

export interface RouteProfit extends Omit<ProfitGroup, "key"> {
  /** Rodomas pavadinimas — taip, kaip parašyta pirmame tos krypties reise. */
  origin: string;
  destination: string;
}

/** Be diakritikos, be didžiųjų, be dvigubų tarpų. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function routeKey(origin: string, destination: string): string {
  return `${fold(origin)}→${fold(destination)}`;
}

/**
 * Kryptys, pelningiausia viršuje.
 *
 * Priešingos kryptys **nesujungiamos**: Panevėžys → Oslas ir Oslas → Panevėžys
 * paprastai turi visai skirtingą kainą, ir būtent tas skirtumas čia įdomiausias.
 */
export function summarizeByRoute(trips: TripSummary[]): RouteProfit[] {
  const labels = new Map<string, { origin: string; destination: string }>();

  for (const trip of trips) {
    const key = routeKey(trip.origin, trip.destination);
    if (!labels.has(key)) {
      labels.set(key, { origin: trip.origin, destination: trip.destination });
    }
  }

  return groupProfit(trips, (trip) => routeKey(trip.origin, trip.destination)).map(
    ({ key, ...totals }) => ({
      origin: labels.get(key)?.origin ?? key,
      destination: labels.get(key)?.destination ?? "",
      ...totals,
    }),
  );
}
