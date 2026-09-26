/**
 * Reisų iškėlimas į CSV (#115).
 *
 * Duomenys į programą įeina (Excel importas), bet iš jos neišeina. Buhalterijai,
 * klientui ar savo skaičiavimams reikia lentelės, o ne ekrano.
 *
 * Renkamės CSV, o ne .xlsx: rašyti .xlsx reikėtų naujos bibliotekos, o nauda ta
 * pati — failas atsidaro Excel'yje dukart spustelėjus. Bendros rašysenos
 * taisyklės gyvena `lib/csv.ts`.
 */

import { buildCsv, centsToCsv, csvField, decimalToCsv } from "./csv";
import type { TripSummary } from "./trips";

export { CSV_BOM, centsToCsv, csvField } from "./csv";

export const CSV_COLUMNS = [
  "Data",
  "Reiso nr.",
  "Fura",
  "Iš",
  "Į",
  "Apmokami km",
  "Tušti km",
  "Pajamos, EUR",
  "Kaštai, EUR",
  "Pelnas, EUR",
  "Marža, %",
  "Pelnas, EUR/km",
] as const;

function row(trip: TripSummary): string[] {
  return [
    trip.tripDate,
    csvField(trip.tripNumber),
    csvField(trip.truckPlate),
    csvField(trip.origin),
    csvField(trip.destination),
    String(trip.paidKm),
    String(trip.emptyKm),
    centsToCsv(trip.revenueCents),
    centsToCsv(trip.totalCostCents),
    centsToCsv(trip.profitCents),
    decimalToCsv(trip.marginPercent, 1),
    decimalToCsv(trip.profitPerKm, 2),
  ];
}

/** Visa lentelė tekstu. Tuščias sąrašas duoda vien antraštę, o ne tuščią failą. */
export function tripsToCsv(trips: TripSummary[]): string {
  return buildCsv(CSV_COLUMNS, trips.map(row));
}

/** Failo vardas su data, kad atsisiuntimų aplanke jie nesusimaišytų. */
export function csvFileName(today: string): string {
  return `reisai-${today}.csv`;
}
