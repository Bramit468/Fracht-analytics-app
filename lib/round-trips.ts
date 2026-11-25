/**
 * Kelionės pirmyn–atgal (vartotojo sprendimas, 2026-11-25).
 *
 * Kryptį, kurią fura sukasi nuolat (pvz. Jönköping → Lörenskog), pavieniai
 * reisai rodo klaidingai: tuščias grįžimas į bazę tenka kitam bazės kroviniui,
 * o kai fura grįžta su atgaliniu kroviniu, tuščių km neturi nė vienas. Tada
 * vienas reisas atrodo −475 €, kitas +673 €, nors kartu – kaip įprastai.
 *
 * Todėl viena kelionė = atgaliniai kroviniai (jei buvo) + kitas krovinys iš
 * bazės: ji apima ir grįžimą į bazę, ir patį bazės krovinį, tad kelionės
 * palyginamos tarpusavyje.
 */

import type { TripSummary } from "./trips";

/** Mažiau – fura nuolatinės krypties neturi, kelionių nėra ką lyginti. */
const MIN_BASE_TRIPS = 3;

export interface RoundTrip {
  trips: TripSummary[];
  /** `false` – laikotarpio gale: atgaliniai kroviniai be bazės krovinio po jų. */
  complete: boolean;
  revenueCents: number;
  profitCents: number;
  days: number;
  profitPerDayCents: number | null;
}

export interface TruckRounds {
  plate: string;
  /** Bazės pakrovimo vieta, pvz. „Jönköping, SWE“. */
  base: string;
  rounds: RoundTrip[];
  /** Tik užbaigtų kelionių vidurkiai. */
  averageProfitCents: number | null;
  averageProfitPerDayCents: number | null;
}

/** Dažniausia pakrovimo vieta, jei iš jos bent 3 reisai; lygiųjų atveju – abėcėlės tvarka. */
export function baseOrigin(trips: TripSummary[]): string | null {
  const counts = new Map<string, number>();
  for (const trip of trips) counts.set(trip.origin, (counts.get(trip.origin) ?? 0) + 1);
  const [best] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return best && best[1] >= MIN_BASE_TRIPS ? best[0] : null;
}

function round(trips: TripSummary[], complete: boolean): RoundTrip {
  const revenueCents = trips.reduce((sum, trip) => sum + trip.revenueCents, 0);
  const profitCents = trips.reduce((sum, trip) => sum + trip.profitCents, 0);
  const days = Math.round(trips.reduce((sum, trip) => sum + trip.days, 0) * 1000) / 1000;
  return { trips, complete, revenueCents, profitCents, days, profitPerDayCents: days > 0 ? Math.round(profitCents / days) : null };
}

/** Kiekvienai furai su baze – jos kelionės, seniausia pirma. Furos be bazės praleidžiamos. */
export function roundTrips(trips: TripSummary[]): TruckRounds[] {
  const byPlate = new Map<string, TripSummary[]>();
  for (const trip of trips) (byPlate.get(trip.truckPlate) ?? byPlate.set(trip.truckPlate, []).get(trip.truckPlate)!).push(trip);

  const result: TruckRounds[] = [];
  for (const [plate, own] of byPlate) {
    const base = baseOrigin(own);
    if (!base) continue;
    const sorted = [...own].sort((a, b) => a.tripDate.localeCompare(b.tripDate) || a.tripNumber.localeCompare(b.tripNumber));
    const rounds: RoundTrip[] = [];
    let current: TripSummary[] = [];
    for (const trip of sorted) {
      current.push(trip);
      if (trip.origin === base) {
        rounds.push(round(current, true));
        current = [];
      }
    }
    if (current.length > 0) rounds.push(round(current, false));

    const done = rounds.filter((item) => item.complete);
    const profit = done.reduce((sum, item) => sum + item.profitCents, 0);
    const days = done.reduce((sum, item) => sum + item.days, 0);
    result.push({
      plate,
      base,
      rounds,
      averageProfitCents: done.length > 0 ? Math.round(profit / done.length) : null,
      averageProfitPerDayCents: days > 0 ? Math.round(profit / days) : null,
    });
  }
  return result.sort((a, b) => a.plate.localeCompare(b.plate));
}
