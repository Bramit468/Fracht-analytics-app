/**
 * Faktiškai sumokėti furos kaštai per mėnesį (migracija 0029).
 *
 * Reisų pelnas – iš normų; čia – kas iš tikrųjų sumokėta, su prastovomis ir
 * savaitgaliais. Kuro, AdBlue ir kelių rinkliavų nėra: jie jau reisuose.
 */

import { parseEuroToCents } from "./money";
import { addDays } from "./trip-progress";

export const MONTH_COST_FIELDS = [
  { key: "driver_cents", label: "Vairuotojas", hint: "Alga, dienpinigiai, mokesčiai – su savaitgaliais" },
  { key: "leasing_cents", label: "Lizingas / nuoma", hint: "Vilkikas ir priekaba" },
  { key: "insurance_cents", label: "Draudimas", hint: "KASKO, civilinis, CMR" },
  { key: "vehicle_tax_cents", label: "Mokesčiai", hint: "Transporto priemonių mokestis, vinjetės (ne kelių rinkliavos)" },
  { key: "repairs_cents", label: "Remontas", hint: "Remontas ir aptarnavimas" },
  { key: "tires_cents", label: "Padangos", hint: "" },
  { key: "overhead_cents", label: "Administracija", hint: "Biuro, TA ir kt. dalis šiai furai" },
  { key: "other_cents", label: "Kita", hint: "" },
] as const;

export type MonthCostField = (typeof MONTH_COST_FIELDS)[number]["key"];

export type MonthCostRow = { truck_id: string; month: string } & Record<MonthCostField, number>;

/** Visų laukų suma, centais. */
export function monthCostTotal(row: Record<MonthCostField, number>): number {
  return MONTH_COST_FIELDS.reduce((sum, { key }) => sum + row[key], 0);
}

/** „2026-10“ → „2026-10-01“; netinkamas ar tuščias – praėjęs mėnuo (jo sąskaitos jau gautos). */
export function parseMonth(value: string | string[] | undefined, today: string): string {
  const text = Array.isArray(value) ? value[0] : value;
  if (text && /^\d{4}-(0[1-9]|1[0-2])$/.test(text)) return `${text}-01`;
  return addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7) + "-01";
}

/** Mėnesio dienų skaičius; `month` – „2026-10-01“. */
export function daysInMonth(month: string): number {
  const [year, mm] = month.split("-").map(Number);
  return new Date(Date.UTC(year, mm, 0)).getUTCDate();
}

export function monthCostFieldName(truckId: string, field: MonthCostField): string {
  return `${truckId}:${field}`;
}

export interface ParsedMonthCosts {
  /** Įrašyti (bent vienas laukas užpildytas). */
  rows: MonthCostRow[];
  /** Visi laukai tušti – mėnesio eilutė trinama. */
  cleared: string[];
  /** Klaidos pagal furos id ir lauką. */
  errors: Record<string, Partial<Record<MonthCostField, string>>>;
}

/**
 * Lentelės reikšmės → eilutės. Griežtai, kaip kitur su žmogaus įvestimi
 * (`parseEuroToCents`): ne skaičius ar daugiau nei 2 skaitmenys po kablelio – klaida.
 */
export function parseMonthCosts(
  values: Record<string, Partial<Record<MonthCostField, string>>>,
  truckIds: string[],
  month: string,
): ParsedMonthCosts {
  const result: ParsedMonthCosts = { rows: [], cleared: [], errors: {} };
  for (const truckId of truckIds) {
    const typed = values[truckId] ?? {};
    if (MONTH_COST_FIELDS.every(({ key }) => !(typed[key] ?? "").trim())) {
      result.cleared.push(truckId);
      continue;
    }
    const row = { truck_id: truckId, month } as MonthCostRow;
    for (const { key } of MONTH_COST_FIELDS) {
      const text = (typed[key] ?? "").trim();
      const cents = text === "" ? 0 : parseEuroToCents(text);
      if (cents === null) (result.errors[truckId] ??= {})[key] = "Suma eurais, pvz. 1250,50";
      else row[key] = cents;
    }
    if (!result.errors[truckId]) result.rows.push(row);
  }
  return result;
}
