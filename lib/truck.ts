/**
 * Furos duomenys: formos nuskaitymas ir vertimas į skaičiavimų formą (#24).
 *
 * Duomenų bazė ir forma naudoja stulpelių pavadinimus (snake_case, centai),
 * o lib/calc.ts — savo camelCase tipus. Šitas failas yra tiltas tarp jų,
 * kad skaičiavimai ir toliau nieko nežinotų apie duomenų bazę.
 */

import type { Truck as CalcTruck, TruckDailyCosts } from "./calc";
import { centsToInput, parseEuroToCents } from "./money";
import type { TruckInsert } from "../types/truck";

type CentsColumn = Extract<keyof TruckInsert, `${string}_cents`>;
type DailyCostColumn = Exclude<CentsColumn, "trailer_monthly_cents">;

/**
 * Paros dedamosios: kuris skaičiavimų laukas atitinka kurį stulpelį.
 *
 * `Record<keyof TruckDailyCosts, …>` priverčia čia surašyti visas dedamąsias —
 * pridėjus naują į TruckDailyCosts, TypeScript neleis pamiršti jos čia.
 */
export const DAILY_COSTS = {
  depreciation: { column: "depreciation_cents", label: "Nusidėvėjimas" },
  interest: { column: "interest_cents", label: "Palūkanos" },
  insuranceKasko: { column: "insurance_kasko_cents", label: "Draudimas kasko" },
  insuranceCivil: { column: "insurance_civil_cents", label: "Civilinis draudimas" },
  insuranceCmr: { column: "insurance_cmr_cents", label: "CMR + DCA + sveikatos draudimas" },
  driverSalary: { column: "driver_salary_cents", label: "Vairuotojo atlyginimas ir mokesčiai" },
  perDiem: { column: "per_diem_cents", label: "Komandiruotpinigiai" },
  repairs: { column: "repairs_cents", label: "Remontas" },
  management: { column: "management_cents", label: "Vadyba" },
} as const satisfies Record<keyof TruckDailyCosts, { column: DailyCostColumn; label: string }>;

const DAILY_COST_KEYS = Object.keys(DAILY_COSTS) as (keyof TruckDailyCosts)[];

/** Formos laukų vardai. Sutampa su `trucks` stulpeliais. */
export type TruckFormField = keyof TruckInsert;

/**
 * Svoriai PTV kuro ir CO2e skaičiavimui (#86).
 *
 * Laikomi atskirai nuo kaštų: tai vilkiko savybė, o ne pinigai, ir į kaštų
 * lentelę jie patekti neturi.
 */
export const WEIGHT_FIELDS = ["empty_weight_kg", "total_permitted_weight_kg"] as const;

export type TruckWeightField = (typeof WEIGHT_FIELDS)[number];

export const WEIGHT_LABELS: Record<TruckWeightField, string> = {
  empty_weight_kg: "Svoris be krovinio, kg",
  total_permitted_weight_kg: "Leistina bendra masė, kg",
};

const WEIGHT_MIN_KG = 1000;
const WEIGHT_MAX_KG = 100000;

export const TRUCK_FORM_FIELDS: readonly TruckFormField[] = [
  "plate",
  ...DAILY_COST_KEYS.map((key) => DAILY_COSTS[key].column),
  "trailer_monthly_cents",
  "working_days_per_month",
  ...WEIGHT_FIELDS,
];

export const DEFAULT_WORKING_DAYS_PER_MONTH = 22;

const PLATE_MAX_LENGTH = 20;
const WORKING_DAYS_MAX = 31;

export type TruckFormErrors = Partial<Record<TruckFormField, string>>;

export type ParseTruckFormResult =
  | { ok: true; value: TruckInsert }
  | { ok: false; errors: TruckFormErrors };

/** Formos reikšmės tekstu. Tuščias laukas grąžinamas kaip "". */
export type TruckFormValues = Partial<Record<TruckFormField, string>>;

/** Iš FormData paima tik furos laukus (be Next.js vidinių `$ACTION_…`). */
export function readTruckFormValues(formData: FormData): TruckFormValues {
  const values: TruckFormValues = {};
  for (const field of TRUCK_FORM_FIELDS) {
    const raw = formData.get(field);
    values[field] = typeof raw === "string" ? raw : "";
  }
  return values;
}

/** Numerį suvienodina: be tarpų kraštuose, vienas tarpas viduje, didžiosios raidės. */
export function normalizePlate(input: string): string {
  return input.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Patikrina formos reikšmes ir paverčia jas eilute įrašymui.
 *
 * Sumos įvedamos eurais ir paverčiamos centais. Tuščia suma reiškia 0 — daug
 * dedamųjų (palūkanos, vadyba) dažnai būna nulinės.
 */
export function parseTruckForm(values: TruckFormValues): ParseTruckFormResult {
  const errors: TruckFormErrors = {};

  const plate = normalizePlate(values.plate ?? "");
  if (plate === "") {
    errors.plate = "Įveskite valstybinį numerį.";
  } else if (plate.length > PLATE_MAX_LENGTH) {
    errors.plate = `Numeris per ilgas (daugiausia ${PLATE_MAX_LENGTH} simbolių).`;
  }

  const money = (field: CentsColumn): number => {
    const text = (values[field] ?? "").trim();
    if (text === "") {
      return 0;
    }
    const cents = parseEuroToCents(text);
    if (cents === null) {
      errors[field] = "Įveskite neneigiamą sumą eurais, pvz. 57 arba 57,50.";
      return 0;
    }
    return cents;
  };

  const daily = {} as Record<DailyCostColumn, number>;
  for (const key of DAILY_COST_KEYS) {
    const column = DAILY_COSTS[key].column;
    daily[column] = money(column);
  }
  const trailerMonthly = money("trailer_monthly_cents");

  const daysText = (values.working_days_per_month ?? "").trim();
  const workingDays = daysText === "" ? DEFAULT_WORKING_DAYS_PER_MONTH : Number(daysText);
  if (!Number.isInteger(workingDays) || workingDays < 1 || workingDays > WORKING_DAYS_MAX) {
    errors.working_days_per_month = `Įveskite sveiką skaičių nuo 1 iki ${WORKING_DAYS_MAX}.`;
  }

  /** Tuščias svoris reiškia „nežinoma“, o ne nulį: spėti masės negalima (#86). */
  const weight = (field: TruckWeightField): number | null => {
    const raw = (values[field] ?? "").trim().replace(/\s/g, "");
    if (raw === "") return null;
    const kilograms = Number(raw);
    if (!Number.isInteger(kilograms) || kilograms < WEIGHT_MIN_KG || kilograms > WEIGHT_MAX_KG) {
      errors[field] = `Įveskite kilogramus, sveiką skaičių nuo ${WEIGHT_MIN_KG} iki ${WEIGHT_MAX_KG}.`;
      return null;
    }
    return kilograms;
  };

  const weights = {
    empty_weight_kg: weight("empty_weight_kg"),
    total_permitted_weight_kg: weight("total_permitted_weight_kg"),
  };

  if (
    weights.empty_weight_kg !== null &&
    weights.total_permitted_weight_kg !== null &&
    weights.empty_weight_kg > weights.total_permitted_weight_kg
  ) {
    errors.empty_weight_kg = "Tuščias vilkikas negali sverti daugiau už leistiną bendrą masę.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      plate,
      ...daily,
      trailer_monthly_cents: trailerMonthly,
      working_days_per_month: workingDays,
      ...weights,
    },
  };
}

/**
 * Įrašytą furą paverčia formos reikšmėmis — taisymo formai užpildyti (#39).
 *
 * Sumos grąžinamos į eurus tokiu pavidalu, kokį `parseTruckForm` perskaito
 * atgal į tuos pačius centus. `formatCents` čia netinka: „269,00 €" su valiutos
 * ženklu nebeperskaitoma.
 */
export function truckRowToFormValues(row: TruckInsert): TruckFormValues {
  const values: TruckFormValues = {};
  for (const field of TRUCK_FORM_FIELDS) {
    if (field === "plate") {
      values[field] = row.plate;
    } else if (field === "working_days_per_month") {
      values[field] = String(row.working_days_per_month);
    } else if (field === "empty_weight_kg" || field === "total_permitted_weight_kg") {
      // Nežinomas svoris lieka tuščias laukas, o ne „0“ — nulis būtų netiesa.
      values[field] = row[field] === null ? "" : String(row[field]);
    } else {
      values[field] = centsToInput(row[field]);
    }
  }
  return values;
}

/** Duomenų bazės eilutę paverčia į tai, ką priima lib/calc.ts. */
export function truckRowToCalc(row: TruckInsert): CalcTruck {
  const dailyCents = {} as TruckDailyCosts;
  for (const key of DAILY_COST_KEYS) {
    dailyCents[key] = row[DAILY_COSTS[key].column];
  }

  return {
    dailyCents,
    trailerMonthlyCents: row.trailer_monthly_cents,
    workingDaysPerMonth: row.working_days_per_month,
  };
}
