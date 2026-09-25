/**
 * Reisų iškėlimas į CSV (#115).
 *
 * Duomenys į programą įeina (Excel importas), bet iš jos neišeina. Buhalterijai,
 * klientui ar savo skaičiavimams reikia lentelės, o ne ekrano.
 *
 * Renkamės CSV, o ne .xlsx: rašyti .xlsx reikėtų naujos bibliotekos, o nauda ta
 * pati — failas atsidaro Excel'yje dukart spustelėjus. Bet tai pavyksta tik
 * laikantis lietuviško Excel'io įpročių, todėl:
 *   - skiriamasis ženklas yra kabliataškis (lietuviškas sąrašo skirtukas);
 *   - trupmenos su kableliu, nes Excel su tašku „57,50“ paverstų data;
 *   - failas prasideda BOM, kitaip „Panevėžys“ virsta „PanevÄ—Å¾ys“.
 */

import type { TripSummary } from "./trips";

/** Excel eilutėje kabliataškis skiria stulpelius. */
const SEPARATOR = ";";

/** Be šito Excel nuskaito failą sistemine koduote ir sudarko lietuviškas raides. */
export const CSV_BOM = "﻿";

export const CSV_COLUMNS = [
  "Data",
  "Reiso nr.",
  "Fura",
  "Iš",
  "Į",
  "Apmokami km",
  "Pajamos, EUR",
  "Kaštai, EUR",
  "Pelnas, EUR",
  "Marža, %",
  "Pelnas, EUR/km",
] as const;

/** Centai į „1234,56“ — sveikaisiais, todėl be slankiojo kablelio klaidų. */
export function centsToCsv(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(absolute / 100)},${String(absolute % 100).padStart(2, "0")}`;
}

function decimal(value: number | null, places: number): string {
  return value === null ? "" : value.toFixed(places).replace(".", ",");
}

/**
 * Laukas su kabliataškiu, kabutėmis ar eilutės lūžiu imamas į kabutes.
 *
 * Adresai kaip „Klaipėdos g. 45, Panevėžys“ kabliataškio neturi, bet reiso
 * numeryje ar pastaboje jis pasitaiko, ir tada eilutė suskiltų į du stulpelius.
 */
export function csvField(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function row(trip: TripSummary): string {
  return [
    trip.tripDate,
    csvField(trip.tripNumber),
    csvField(trip.truckPlate),
    csvField(trip.origin),
    csvField(trip.destination),
    String(trip.paidKm),
    centsToCsv(trip.revenueCents),
    centsToCsv(trip.totalCostCents),
    centsToCsv(trip.profitCents),
    decimal(trip.marginPercent, 1),
    decimal(trip.profitPerKm, 2),
  ].join(SEPARATOR);
}

/** Visa lentelė tekstu. Tuščias sąrašas duoda vien antraštę, o ne tuščią failą. */
export function tripsToCsv(trips: TripSummary[]): string {
  return [CSV_COLUMNS.join(SEPARATOR), ...trips.map(row)].join("\r\n");
}

/** Failo vardas su data, kad atsisiuntimų aplanke jie nesusimaišytų. */
export function csvFileName(today: string): string {
  return `reisai-${today}.csv`;
}
