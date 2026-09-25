/**
 * Visų furų svoriai viename lange (#121).
 *
 * #86 pridėjo svorius, nuo kurių priklauso PTV kuro ir CO2e skaičius, bet jie
 * suvedami po vieną furos formoje. Dvidešimt dviem furoms tai dvidešimt du
 * atidarymai, o parkas dažnai yra vienodas: tas pats vilkiko ir priekabos
 * derinys, ta pati leistina masė.
 *
 * Kol svoriai tušti, PTV ima savo numatytuosius, ir kuro įvertis lieka bendras,
 * o ne šios furos.
 */

import {
  parseTruckForm,
  truckRowToFormValues,
  WEIGHT_FIELDS,
  type TruckFormErrors,
  type TruckFormValues,
  type TruckWeightField,
} from "./truck";
import type { Truck, TruckInsert } from "../types/truck";

export type TruckWeights = Pick<TruckInsert, TruckWeightField>;

export interface BulkWeightUpdate {
  id: string;
  plate: string;
  value: TruckWeights;
}

export interface ParsedBulkWeights {
  /** Tik pasikeitusios eilutės. */
  updates: BulkWeightUpdate[];
  errors: Record<string, TruckFormErrors>;
}

/** Formos lauko vardas. UUID dvitaškio neturi, tad skaidyti saugu. */
export function weightFieldName(truckId: string, field: TruckWeightField): string {
  return `${truckId}:${field}`;
}

export function readBulkWeightValues(
  formData: FormData,
  trucks: Truck[],
): Record<string, TruckFormValues> {
  const values: Record<string, TruckFormValues> = {};

  for (const truck of trucks) {
    const row: TruckFormValues = {};
    for (const field of WEIGHT_FIELDS) {
      const raw = formData.get(weightFieldName(truck.id, field));
      row[field] = typeof raw === "string" ? raw : "";
    }
    values[truck.id] = row;
  }

  return values;
}

/**
 * Patikrina ir palieka tik pasikeitusias eilutes.
 *
 * Patikra ta pati kaip vienos furos formoje: kaštai paimami iš duomenų bazės,
 * kad `parseTruckForm` turėtų pilną eilutę, o į atnaujinimą patenka tik svoriai.
 */
export function parseBulkWeights(
  values: Record<string, TruckFormValues>,
  trucks: Truck[],
): ParsedBulkWeights {
  const updates: BulkWeightUpdate[] = [];
  const errors: Record<string, TruckFormErrors> = {};

  for (const truck of trucks) {
    const row = values[truck.id];
    if (!row) continue;

    const parsed = parseTruckForm({ ...truckRowToFormValues(truck), ...row });

    if (!parsed.ok) {
      // Rodomos tik svorių klaidos: kaštai čia neredaguojami, o jų klaida
      // šitame lange atrodytų kaip nesusipratimas.
      const weightErrors: TruckFormErrors = {};
      for (const field of WEIGHT_FIELDS) {
        if (parsed.errors[field]) weightErrors[field] = parsed.errors[field];
      }
      if (Object.keys(weightErrors).length > 0) errors[truck.id] = weightErrors;
      continue;
    }

    const value = {} as TruckWeights;
    let changed = false;

    for (const field of WEIGHT_FIELDS) {
      value[field] = parsed.value[field];
      if (parsed.value[field] !== truck[field]) changed = true;
    }

    if (changed) updates.push({ id: truck.id, plate: truck.plate, value });
  }

  return { updates, errors };
}

/** Furos, kurių svoriai dar nenurodyti — joms PTV skaičiuoja bendrai. */
export function trucksMissingWeights(trucks: Truck[]): Truck[] {
  return trucks.filter((truck) =>
    WEIGHT_FIELDS.some((field) => truck[field] === null),
  );
}

/**
 * Tos pačios reikšmės visoms furoms, kurioms jų dar nėra.
 *
 * Užpildytų svorių neperrašo: jie suvesti sąmoningai, o parko „vidurkis“ juos
 * tyliai sugadintų.
 */
export function fillEmptyWeights(
  values: Record<string, TruckFormValues>,
  weights: Record<TruckWeightField, string>,
): Record<string, TruckFormValues> {
  const filled: Record<string, TruckFormValues> = {};

  for (const [id, row] of Object.entries(values)) {
    const next: TruckFormValues = { ...row };
    for (const field of WEIGHT_FIELDS) {
      if ((next[field] ?? "").trim() === "") next[field] = weights[field];
    }
    filled[id] = next;
  }

  return filled;
}
