/**
 * Suvestinės lentelių iškėlimas į Excel (#133).
 *
 * Reisų sąrašas jau iškeliamas (#115), bet suvestinės pjūviai — furos, kryptys,
 * šalys ir mėnesiai — lieka ekrane. O būtent jie ir eina į pokalbį su
 * buhalteriu, banku ar bendrasavininkiu, ir dabar perrašomi ranka.
 */

import { buildCsv, centsToCsv, csvField, decimalToCsv } from "./csv";
import type { CountryRoadSummary } from "./country-roads";
import type { FuelPriceRow } from "./fuel-prices";
import type { ActualCosts } from "./telematics-costs";
import type { MonthStats } from "./monthly";
import type { RouteProfit } from "./route-profit";
import type { TruckProfit } from "./truck-profit";

const PROFIT_COLUMNS = [
  "Reisai",
  "Apmokami km",
  "Pajamos, EUR",
  "Kaštai, EUR",
  "Pelnas, EUR",
  "Marža, %",
  "Savikaina, EUR/km",
  "Pelnas, EUR/km",
] as const;

function profitCells(row: {
  tripCount: number;
  paidKm: number;
  revenueCents: number;
  totalCostCents: number;
  profitCents: number;
  marginPercent: number | null;
  costPerKm: number | null;
  profitPerKm: number | null;
}): string[] {
  return [
    String(row.tripCount),
    String(Math.round(row.paidKm)),
    centsToCsv(row.revenueCents),
    centsToCsv(row.totalCostCents),
    centsToCsv(row.profitCents),
    decimalToCsv(row.marginPercent, 1),
    decimalToCsv(row.costPerKm, 2),
    decimalToCsv(row.profitPerKm, 2),
  ];
}

export function trucksToCsv(rows: TruckProfit[]): string {
  return buildCsv(
    ["Fura", ...PROFIT_COLUMNS],
    rows.map((row) => [csvField(row.plate), ...profitCells(row)]),
  );
}

export function routesToCsv(rows: RouteProfit[]): string {
  return buildCsv(
    ["Iš", "Į", ...PROFIT_COLUMNS],
    rows.map((row) => [csvField(row.origin), csvField(row.destination), ...profitCells(row)]),
  );
}

export function countriesToCsv(rows: CountryRoadSummary[]): string {
  return buildCsv(
    ["Šalis", "Reisai", "Km", "Keliai, EUR", "Dalis, %", "EUR/km"],
    rows.map((row) => [
      csvField(row.country),
      String(row.tripCount),
      String(Math.round(row.km)),
      centsToCsv(row.costCents),
      decimalToCsv(row.costShare, 1),
      // `centsPerKm` yra centai, o lentelėje ir faile rodomi eurai.
      decimalToCsv(row.centsPerKm === null ? null : row.centsPerKm / 100, 2),
    ]),
  );
}

export function monthsToCsv(rows: MonthStats[]): string {
  return buildCsv(
    ["Mėnuo", "Reisai", "Apmokami km", "Pajamos, EUR", "Kaštai, EUR", "Pelnas, EUR", "Marža, %", "Savikaina, EUR/km"],
    rows.map((row) => [
      row.month,
      String(row.tripCount),
      String(Math.round(row.paidKm)),
      centsToCsv(row.revenueCents),
      centsToCsv(row.totalCostCents),
      centsToCsv(row.profitCents),
      decimalToCsv(row.marginPercent, 1),
      decimalToCsv(row.costPerKm, 2),
    ]),
  );
}

/**
 * Faktiniai kaštai pagal furą (#141).
 *
 * Būtent šitą lentelę prašo buhalterija: kiek fura nuvažiavo ir kiek realiai
 * išleista kurui, AdBlue ir keliams per laikotarpį.
 */
export function actualsToCsv(rows: ActualCosts[]): string {
  return buildCsv(
    [
      "Fura",
      "Nuo",
      "Iki",
      "Dienos",
      "km",
      "Litrai",
      "l/100 km",
      "EUR/l",
      "Kuras, EUR",
      "AdBlue, EUR",
      "Keliai, EUR",
      "Kita, EUR",
      "Iš viso, EUR",
    ],
    rows.map((row) => [
      csvField(row.plate),
      row.from,
      row.to,
      String(row.days),
      String(Math.round(row.km)),
      decimalToCsv(row.fuelL, 1),
      decimalToCsv(row.litresPer100Km, 2),
      decimalToCsv(row.fuelPricePerL, 3),
      centsToCsv(row.dieselCents),
      centsToCsv(row.adblueCents),
      centsToCsv(row.tollCents),
      // „Kita“ į bendrą sumą neįeina ir faile: telematikos puslapis ją laiko
      // atskirai, o dvi skirtingos sumos tame pačiame skaičiuje klaidintų.
      centsToCsv(row.otherCents),
      centsToCsv(row.totalCents),
    ]),
  );
}

/** Kuro kainos pagal šalį arba mėnesį (#139). */
export function fuelPricesToCsv(rows: FuelPriceRow[], firstColumn: string): string {
  return buildCsv(
    [firstColumn, "Pylimai", "Litrai", "Suma, EUR", "EUR/l"],
    rows.map((row) => [
      csvField(row.key === "" ? "Nenurodyta" : row.key),
      String(row.purchases),
      decimalToCsv(row.litres, 1),
      centsToCsv(row.costCents),
      decimalToCsv(row.pricePerL, 3),
    ]),
  );
}

/** Failo vardas su data ir pjūviu, kad atsisiuntimuose jie nesusimaišytų. */
export function reportFileName(report: string, today: string): string {
  return `${report}-${today}.csv`;
}
