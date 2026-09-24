/**
 * Visų furų paros kaštai viename lange (#99).
 *
 * Šiuo metu visos furos turi tą pačią savikainą, nukopijuotą nuo pirmosios,
 * todėl kiekvienas pelno skaičius programoje yra apytikslis. Taisyti po vieną
 * reiškia dvidešimt du kartus atidaryti formą, o skirtumas tarp furų dažnai yra
 * vos keli laukai — lizingas, remontas, vairuotojas.
 *
 * Patikra ta pati kaip vienos furos formoje: čia tik atrenkama, kurios eilutės
 * apskritai pasikeitė, kad nebūtų perrašomos nepaliestos furos.
 */

import {
  DAILY_COSTS,
  parseTruckForm,
  TRUCK_FORM_FIELDS,
  type TruckFormErrors,
  type TruckFormValues,
} from "./truck";
import type { Truck, TruckInsert } from "../types/truck";

/** Kaštų laukai. Numeris čia neredaguojamas — jis taisomas furos formoje. */
export type TruckCostField = Exclude<keyof TruckInsert, "plate">;

export const TRUCK_COST_FIELDS: readonly TruckCostField[] = TRUCK_FORM_FIELDS.filter(
  (field): field is TruckCostField => field !== "plate",
);

/**
 * Trumpi stulpelių pavadinimai.
 *
 * Lentelėje telpa vienuolika stulpelių, o pilni pavadinimai („Vairuotojo
 * atlyginimas ir mokesčiai“) ją išplėstų per visą ekraną. Pilną pavadinimą
 * grąžina `costLabel` — jis rodomas užvedus pelę.
 */
export const COST_SHORT_LABELS: Record<TruckCostField, string> = {
  depreciation_cents: "Nusidėv.",
  interest_cents: "Palūk.",
  insurance_kasko_cents: "Kasko",
  insurance_civil_cents: "Civilinis",
  insurance_cmr_cents: "CMR",
  driver_salary_cents: "Vairuotojas",
  per_diem_cents: "Komand.",
  repairs_cents: "Remontas",
  management_cents: "Vadyba",
  trailer_monthly_cents: "Priekaba/mėn.",
  working_days_per_month: "D. d./mėn.",
};

const EXTRA_LABELS: Partial<Record<TruckCostField, string>> = {
  trailer_monthly_cents: "Priekabos nuoma, EUR/mėn.",
  working_days_per_month: "Darbo dienų per mėnesį",
};

/** Pilnas lauko pavadinimas — toks pat kaip vienos furos formoje. */
export function costLabel(field: TruckCostField): string {
  const daily = Object.values(DAILY_COSTS).find((cost) => cost.column === field);
  return daily?.label ?? EXTRA_LABELS[field] ?? field;
}

/** Vienos eilutės reikšmės tekstu, raktas — furos `id`. */
export type BulkCostValues = Record<string, TruckFormValues>;

export interface BulkCostUpdate {
  id: string;
  plate: string;
  value: Pick<TruckInsert, TruckCostField>;
}

export interface ParsedBulkCosts {
  /** Tik pasikeitusios eilutės. */
  updates: BulkCostUpdate[];
  /** Klaidos pagal furos `id`. */
  errors: Record<string, TruckFormErrors>;
}

/** Formos lauko vardas: `id` ir stulpelis. UUID dvitaškio neturi. */
export function costFieldName(truckId: string, field: TruckCostField): string {
  return `${truckId}:${field}`;
}

/** Iš formos paima reikšmes tik toms furoms, kurias iš tikrųjų turime. */
export function readBulkCostValues(formData: FormData, trucks: Truck[]): BulkCostValues {
  const values: BulkCostValues = {};

  for (const truck of trucks) {
    const row: TruckFormValues = {};
    for (const field of TRUCK_COST_FIELDS) {
      const raw = formData.get(costFieldName(truck.id, field));
      row[field] = typeof raw === "string" ? raw : "";
    }
    values[truck.id] = row;
  }

  return values;
}

/**
 * Patikrina visas eilutes ir palieka tik pasikeitusias.
 *
 * Numeris įdedamas iš duomenų bazės, kad pasinaudotume ta pačia `parseTruckForm`
 * patikra ir nesidubliuotų taisyklės; į atnaujinimą jis nepatenka.
 */
export function parseBulkCosts(values: BulkCostValues, trucks: Truck[]): ParsedBulkCosts {
  const updates: BulkCostUpdate[] = [];
  const errors: Record<string, TruckFormErrors> = {};

  for (const truck of trucks) {
    const row = values[truck.id];
    if (!row) continue;

    const parsed = parseTruckForm({ ...row, plate: truck.plate });

    if (!parsed.ok) {
      errors[truck.id] = parsed.errors;
      continue;
    }

    const value = {} as Pick<TruckInsert, TruckCostField>;
    let changed = false;

    for (const field of TRUCK_COST_FIELDS) {
      value[field] = parsed.value[field];
      if (parsed.value[field] !== truck[field]) {
        changed = true;
      }
    }

    if (changed) {
      updates.push({ id: truck.id, plate: truck.plate, value });
    }
  }

  return { updates, errors };
}

/**
 * Furos, kurių visi kaštai sutampa su kita fura iki cento.
 *
 * Toks sutapimas atsiranda tik kopijuojant: net dvi vienodos furos skiriasi
 * bent lizingo likučiu ar vairuotojo atlyginimu. Dėl to tokias eilutes verta
 * parodyti — jose pelnas skaičiuojamas iš svetimų skaičių.
 */
export function copiedTruckIds(trucks: Truck[]): Set<string> {
  const seen = new Map<string, string[]>();

  for (const truck of trucks) {
    const key = TRUCK_COST_FIELDS.map((field) => truck[field]).join("|");
    const ids = seen.get(key);
    if (ids) {
      ids.push(truck.id);
    } else {
      seen.set(key, [truck.id]);
    }
  }

  const copied = new Set<string>();
  for (const ids of seen.values()) {
    if (ids.length > 1) {
      for (const id of ids) copied.add(id);
    }
  }

  return copied;
}
