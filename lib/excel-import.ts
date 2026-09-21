import { parseEuroToCents } from "./money";
import type { CountryTariff } from "./calc";
import type { TripCountryLegInsert, TripInsert } from "../types/trip";
import type { Truck } from "../types/truck";

export type ExcelCell = string | number | boolean | Date | null;

export const importFields = [
  { key: "tripNumber", label: "Reiso nr.", required: true, aliases: ["trip number", "trip_number", "reiso numeris", "reiso nr", "nr"] },
  { key: "truckPlate", label: "Furos numeris", required: true, aliases: ["truck plate", "truck", "fura", "fūros numeris", "valstybinis numeris"] },
  { key: "origin", label: "Iš", required: true, aliases: ["origin", "from", "pradzia", "pradžia", "is", "iš"] },
  { key: "destination", label: "Į", required: true, aliases: ["destination", "to", "pabaiga", "iki"] },
  { key: "tripDate", label: "Data", required: true, aliases: ["date", "trip date", "trip_date", "data"] },
  { key: "paidKm", label: "Apmokami km", required: true, aliases: ["paid km", "paid_km", "distance", "distance km", "atstumas", "apmokami km"] },
  { key: "revenue", label: "Pajamos (€)", required: true, aliases: ["revenue", "freight price", "income", "pajamos", "kaina"] },
  { key: "emptyKm", label: "Tušti km", required: false, aliases: ["empty km", "empty_km", "tusti km", "tušti km"] },
  { key: "days", label: "Reiso trukmė (paros)", required: false, aliases: ["days", "trip days", "duration", "dienos"] },
  { key: "fuelConsumption", label: "Kuro sąnaudos (l/100 km)", required: false, aliases: ["fuel consumption", "fuel l/100km", "kuro sanaudos", "kuro sąnaudos"] },
  { key: "fuelPrice", label: "Kuro kaina (€/l)", required: false, aliases: ["fuel price", "diesel price", "kuro kaina"] },
  { key: "adblueConsumption", label: "AdBlue sąnaudos (l/100 km)", required: false, aliases: ["adblue consumption", "adblue l/100km", "adblue sanaudos", "adblue sąnaudos"] },
  { key: "adbluePrice", label: "AdBlue kaina (€/l)", required: false, aliases: ["adblue price", "adblue kaina"] },
  { key: "roadCountry", label: "Kelių įkainio šalis", required: false, aliases: ["road country", "country", "salis", "šalis"] },
  { key: "bridges", label: "Tiltai / vinjetės (€)", required: false, aliases: ["bridges", "vignettes", "tiltai", "vinjetes"] },
  { key: "ferries", label: "Keltai (€)", required: false, aliases: ["ferries", "ferry", "keltai"] },
  { key: "tunnels", label: "Tuneliai (€)", required: false, aliases: ["tunnels", "tuneliai"] },
  { key: "parking", label: "Parkingas (€)", required: false, aliases: ["parking", "parkavimas"] },
] as const;

export type ImportField = typeof importFields[number]["key"];
export type ColumnMapping = Record<ImportField, number | null>;

export interface ValidImportRow {
  sourceRow: number;
  trip: TripInsert;
  legs: TripCountryLegInsert[];
}

export interface InvalidImportRow {
  sourceRow: number;
  tripNumber: string;
  reason: string;
}

export interface ImportPreview {
  validRows: ValidImportRow[];
  invalidRows: InvalidImportRow[];
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("lt-LT").replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function suggestColumnMapping(headers: string[]): ColumnMapping {
  return Object.fromEntries(importFields.map((field) => {
    const aliases = new Set(field.aliases.map(normalize));
    const index = headers.findIndex((header) => aliases.has(normalize(header)));
    return [field.key, index === -1 ? null : index];
  })) as ColumnMapping;
}

export function missingRequiredMappings(mapping: ColumnMapping): string[] {
  return importFields
    .filter((field) => field.required && mapping[field.key] === null)
    .map((field) => field.label);
}

function cellAt(row: ExcelCell[], mapping: ColumnMapping, field: ImportField): ExcelCell {
  const index = mapping[field];
  return index === null ? null : (row[index] ?? null);
}

function cellText(value: ExcelCell): string {
  if (value === null || value instanceof Date) return "";
  return String(value).trim();
}

function requiredText(value: ExcelCell, label: string): string {
  const text = cellText(value);
  if (!text) throw new Error(`${label}: laukas privalomas.`);
  return text;
}

function parseNumberCell(value: ExcelCell, label: string, defaultValue?: number): number {
  if (value === null || cellText(value) === "") {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`${label}: laukas privalomas.`);
  }

  const parsed = typeof value === "number"
    ? value
    : Number(cellText(value).replace(/[\s ]/g, "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label}: turi būti neneigiamas skaičius.`);
  return parsed;
}

function parseMoneyCell(value: ExcelCell, label: string, defaultValue?: number): number {
  if (value === null || cellText(value) === "") {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`${label}: laukas privalomas.`);
  }

  const cents = typeof value === "number"
    ? Math.round(value * 100)
    : parseEuroToCents(cellText(value));
  if (cents === null || !Number.isSafeInteger(cents) || cents < 0 || cents > 2147483647) {
    throw new Error(`${label}: turi būti suma eurais.`);
  }
  return cents;
}

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateCell(value: ExcelCell): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const result = isoDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
    if (result) return result;
  }

  if (typeof value === "number" && value > 0) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000));
    const result = isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    if (result) return result;
  }

  const text = cellText(value);
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (match) {
    const result = isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
    if (result) return result;
  }

  match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text);
  if (match) {
    const result = isoDate(Number(match[3]), Number(match[2]), Number(match[1]));
    if (result) return result;
  }

  throw new Error("Data turi būti Excel data, YYYY-MM-DD arba YYYY.MM.DD.");
}

function isBlankRow(row: ExcelCell[]): boolean {
  return row.every((cell) => cell === null || cellText(cell) === "");
}

export function buildImportPreview(
  rows: ExcelCell[][],
  mapping: ColumnMapping,
  trucks: Truck[],
  tariffs: CountryTariff[],
): ImportPreview {
  const validRows: ValidImportRow[] = [];
  const invalidRows: InvalidImportRow[] = [];
  const trucksByPlate = new Map(trucks.map((truck) => [normalize(truck.plate), truck]));
  const tariffNames = new Map(tariffs.map((tariff) => [normalize(tariff.country), tariff.country]));

  rows.forEach((row, index) => {
    if (isBlankRow(row)) return;
    const sourceRow = index + 2;
    const visibleTripNumber = cellText(cellAt(row, mapping, "tripNumber"));

    try {
      const tripNumber = requiredText(cellAt(row, mapping, "tripNumber"), "Reiso nr.");
      const truckPlate = requiredText(cellAt(row, mapping, "truckPlate"), "Furos numeris");
      const truck = trucksByPlate.get(normalize(truckPlate));
      if (!truck) throw new Error(`Furos ${truckPlate} nėra sąraše.`);

      const days = parseNumberCell(cellAt(row, mapping, "days"), "Reiso trukmė", 1);
      if (!Number.isInteger(days) || days < 1) throw new Error("Reiso trukmė turi būti sveikas skaičius, didesnis už nulį.");

      const paidKm = parseNumberCell(cellAt(row, mapping, "paidKm"), "Apmokami km");
      const emptyKm = parseNumberCell(cellAt(row, mapping, "emptyKm"), "Tušti km", 0);
      const mappedCountry = cellText(cellAt(row, mapping, "roadCountry")) || "Nemokami";
      const country = tariffNames.get(normalize(mappedCountry));
      if (!country) throw new Error(`Kelių įkainio ${mappedCountry} nėra žinyne.`);

      const trip: TripInsert = {
        trip_number: tripNumber,
        origin: requiredText(cellAt(row, mapping, "origin"), "Iš"),
        destination: requiredText(cellAt(row, mapping, "destination"), "Į"),
        trip_date: parseDateCell(cellAt(row, mapping, "tripDate")),
        truck_id: truck.id,
        days,
        paid_km: paidKm,
        empty_km: emptyKm,
        fuel_l_per_100km: parseNumberCell(cellAt(row, mapping, "fuelConsumption"), "Kuro sąnaudos", 0),
        fuel_price: parseNumberCell(cellAt(row, mapping, "fuelPrice"), "Kuro kaina", 0),
        adblue_l_per_100km: parseNumberCell(cellAt(row, mapping, "adblueConsumption"), "AdBlue sąnaudos", 0),
        adblue_price: parseNumberCell(cellAt(row, mapping, "adbluePrice"), "AdBlue kaina", 0),
        bridges_cents: parseMoneyCell(cellAt(row, mapping, "bridges"), "Tiltai / vinjetės", 0),
        ferries_cents: parseMoneyCell(cellAt(row, mapping, "ferries"), "Keltai", 0),
        tunnels_cents: parseMoneyCell(cellAt(row, mapping, "tunnels"), "Tuneliai", 0),
        parking_cents: parseMoneyCell(cellAt(row, mapping, "parking"), "Parkingas", 0),
        revenue_mode: "freight",
        rate_per_km: null,
        freight_price_cents: parseMoneyCell(cellAt(row, mapping, "revenue"), "Revenue"),
      };

      validRows.push({
        sourceRow,
        trip,
        legs: [{ country, km: paidKm + emptyKm }],
      });
    } catch (cause) {
      invalidRows.push({
        sourceRow,
        tripNumber: visibleTripNumber || "—",
        reason: cause instanceof Error ? cause.message : "Netinkama eilutė.",
      });
    }
  });

  return { validRows, invalidRows };
}
