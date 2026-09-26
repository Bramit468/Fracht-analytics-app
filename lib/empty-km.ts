/**
 * Tuščia rida (#123).
 *
 * `empty_km` saugomi nuo pat pradžių, bet niekur nerodomi. O tuščias kilometras
 * degina kurą ir naudoja tą pačią furos parą, tik neuždirba nieko: jis yra
 * grynas kaštas, kurį galima sumažinti tik geresniu krovinių derinimu.
 *
 * Skaičiuojamas kuras, o ne visa savikaina: paros kaštai tenka reisui
 * nepriklausomai nuo to, ar fura rieda tuščia, o kelių mokesčiai sumokami vis
 * tiek. Kuras yra ta dalis, kuri dingsta būtent dėl tuščios ridos.
 */

import type { TripSummary } from "./trips";

export interface EmptyKmStats {
  paidKm: number;
  emptyKm: number;
  totalKm: number;
  /** Tuščios ridos dalis procentais. `null`, kai nevažiuota. */
  emptyShare: number | null;
  /** Kuras, sudegintas tuščiais kilometrais. */
  emptyFuelCents: number;
}

export interface TruckEmptyKm extends EmptyKmStats {
  plate: string;
  tripCount: number;
}

/**
 * Kuro kaštai tuščiai ridai.
 *
 * Skaičiuojama iš reiso normos ir kainos — tų pačių, pagal kurias skaičiuojamas
 * visas reisas, kad skaičiai tarpusavyje sutaptų.
 */
export function emptyFuelCents(
  emptyKm: number,
  litresPer100Km: number,
  fuelPriceEur: number,
): number {
  if (!(emptyKm > 0) || !(litresPer100Km > 0) || !(fuelPriceEur > 0)) return 0;
  return Math.round(emptyKm * (litresPer100Km / 100) * fuelPriceEur * 100);
}

function stats(trips: TripSummary[]): EmptyKmStats {
  const paidKm = trips.reduce((total, trip) => total + trip.paidKm, 0);
  const emptyKm = trips.reduce((total, trip) => total + trip.emptyKm, 0);
  const totalKm = paidKm + emptyKm;

  return {
    paidKm,
    emptyKm,
    totalKm,
    // Dalis nuo visos ridos, ne nuo apmokamos: „20 % tuščia“ suprantama kaip
    // penktadalis viso važiavimo.
    emptyShare: totalKm > 0 ? (emptyKm / totalKm) * 100 : null,
    emptyFuelCents: trips.reduce((total, trip) => total + trip.emptyFuelCents, 0),
  };
}

export function summarizeEmptyKm(trips: TripSummary[]): EmptyKmStats {
  return stats(trips);
}

/** Furos, blogiausia viršuje: didžiausia tuščios ridos dalis. */
export function emptyKmByTruck(trips: TripSummary[]): TruckEmptyKm[] {
  const byPlate = new Map<string, TripSummary[]>();

  for (const trip of trips) {
    const rows = byPlate.get(trip.truckPlate) ?? [];
    rows.push(trip);
    byPlate.set(trip.truckPlate, rows);
  }

  return [...byPlate.entries()]
    .map(([plate, rows]) => ({ plate, tripCount: rows.length, ...stats(rows) }))
    .sort(
      (a, b) =>
        (b.emptyShare ?? -1) - (a.emptyShare ?? -1) || a.plate.localeCompare(b.plate),
    );
}
