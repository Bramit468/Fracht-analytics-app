/**
 * Furos kortelė: viskas apie furą, kas nėra paros kaštai (#164).
 *
 * Iki šiol fura buvo tik numeris ir kaštai. Bet dalis duomenų tiesiogiai
 * keičia skaičiavimą — EURO klasė ir ašių skaičius lemia kelių mokesčius,
 * normos yra atsarginis kuro šaltinis, kai telematika tyli, — o kita dalis
 * reikalinga kasdien: VIN, priekabos numeris, kada baigiasi apžiūra ar
 * draudimas.
 *
 * Visi laukai neprivalomi ir tušti saugomi kaip `null`, ne kaip nulis ar
 * tuščias tekstas: nežinomas dalykas lieka nežinomas, o ne tampa „0 ašių“.
 */

export const EURO_CLASSES = [
  { value: "EURO_3", label: "EURO 3" },
  { value: "EURO_4", label: "EURO 4" },
  { value: "EURO_5", label: "EURO 5" },
  { value: "EEV", label: "EEV" },
  { value: "EURO_6", label: "EURO 6" },
  { value: "EURO_7", label: "EURO 7" },
  { value: "ZERO_EMISSION", label: "Be išmetimų (elektra, vandenilis)" },
] as const;

export const FUEL_TYPES = [
  { value: "DIESEL", label: "Dyzelinas" },
  { value: "HVO", label: "HVO" },
  { value: "LNG", label: "SGD (LNG)" },
  { value: "CNG", label: "SGD (CNG)" },
  { value: "ELECTRIC", label: "Elektra" },
  { value: "HYDROGEN", label: "Vandenilis" },
] as const;

export type EuroClass = (typeof EURO_CLASSES)[number]["value"];
export type FuelType = (typeof FUEL_TYPES)[number]["value"];

/** Kortelės laukai ir jų reikšmių tipai — tokie, kokius saugo duomenų bazė. */
export interface TruckProfile {
  make?: string | null;
  model?: string | null;
  manufacture_year?: number | null;
  vin?: string | null;
  trailer_plate?: string | null;
  euro_class?: EuroClass | null;
  axles?: number | null;
  fuel_type?: FuelType | null;
  fuel_norm_l_per_100km?: number | null;
  adblue_norm_l_per_100km?: number | null;
  inspection_valid_until?: string | null;
  insurance_valid_until?: string | null;
  tachograph_calibration_until?: string | null;
  notes?: string | null;
}

export type TruckProfileField = keyof TruckProfile;

type FieldKind =
  | { kind: "text"; maxLength: number }
  | { kind: "plate" }
  | { kind: "vin" }
  | { kind: "integer"; min: number; max: number }
  | { kind: "decimal"; min: number; max: number }
  | { kind: "date" }
  | { kind: "choice"; options: readonly { value: string; label: string }[] };

export interface ProfileFieldSpec {
  field: TruckProfileField;
  label: string;
  /** Kuriai kortelės daliai priklauso — formoje grupuojama pagal tai. */
  group: "identity" | "technical" | "norms" | "documents" | "notes";
  spec: FieldKind;
  placeholder?: string;
}

export const PROFILE_FIELDS: readonly ProfileFieldSpec[] = [
  { field: "make", label: "Markė", group: "identity", spec: { kind: "text", maxLength: 60 }, placeholder: "Volvo" },
  { field: "model", label: "Modelis", group: "identity", spec: { kind: "text", maxLength: 60 }, placeholder: "FH 500" },
  { field: "manufacture_year", label: "Pagaminimo metai", group: "identity", spec: { kind: "integer", min: 1980, max: 2100 }, placeholder: "2021" },
  { field: "vin", label: "VIN", group: "identity", spec: { kind: "vin" }, placeholder: "17 simbolių" },
  { field: "trailer_plate", label: "Priekabos numeris", group: "identity", spec: { kind: "plate" }, placeholder: "AB 123" },

  { field: "euro_class", label: "EURO klasė", group: "technical", spec: { kind: "choice", options: EURO_CLASSES } },
  { field: "axles", label: "Ašių skaičius (vilkikas + priekaba)", group: "technical", spec: { kind: "integer", min: 2, max: 10 }, placeholder: "5" },
  { field: "fuel_type", label: "Kuro rūšis", group: "technical", spec: { kind: "choice", options: FUEL_TYPES } },

  { field: "fuel_norm_l_per_100km", label: "Kuro norma, l/100 km", group: "norms", spec: { kind: "decimal", min: 0, max: 100 }, placeholder: "27" },
  { field: "adblue_norm_l_per_100km", label: "AdBlue norma, l/100 km", group: "norms", spec: { kind: "decimal", min: 0, max: 20 }, placeholder: "1,5" },

  { field: "inspection_valid_until", label: "Techninė apžiūra galioja iki", group: "documents", spec: { kind: "date" } },
  { field: "insurance_valid_until", label: "Draudimas galioja iki", group: "documents", spec: { kind: "date" } },
  { field: "tachograph_calibration_until", label: "Tachografo kalibravimas iki", group: "documents", spec: { kind: "date" } },

  { field: "notes", label: "Pastabos", group: "notes", spec: { kind: "text", maxLength: 1000 } },
];

export const PROFILE_FIELD_NAMES: readonly TruckProfileField[] = PROFILE_FIELDS.map(
  (row) => row.field,
);

export const PROFILE_GROUPS: { key: ProfileFieldSpec["group"]; title: string }[] = [
  { key: "identity", title: "Apie furą" },
  { key: "technical", title: "Techniniai duomenys" },
  { key: "norms", title: "Normos" },
  { key: "documents", title: "Dokumentai" },
  { key: "notes", title: "Pastabos" },
];

/** VIN be I, O ir Q – jų standartas nenaudoja, kad nebūtų painiojami su 1 ir 0. */
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

/** ISO data, kuri tikrai egzistuoja: „2026-02-30“ netinka. */
function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

type ParsedValue = string | number | null;

/** Viena reikšmė arba klaidos tekstas lietuviškai. */
function parseOne(raw: string, spec: FieldKind): { ok: true; value: ParsedValue } | { ok: false; error: string } {
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };

  switch (spec.kind) {
    case "text":
      return text.length > spec.maxLength
        ? { ok: false, error: `Daugiausia ${spec.maxLength} simbolių.` }
        : { ok: true, value: text };

    case "plate": {
      const plate = text.replace(/\s+/g, " ").toUpperCase();
      return plate.length > 20
        ? { ok: false, error: "Numeris per ilgas." }
        : { ok: true, value: plate };
    }

    case "vin": {
      const vin = text.replace(/\s+/g, "").toUpperCase();
      return VIN_PATTERN.test(vin)
        ? { ok: true, value: vin }
        : { ok: false, error: "VIN turi 17 simbolių be raidžių I, O ir Q." };
    }

    case "integer": {
      const number = Number(text);
      return Number.isInteger(number) && number >= spec.min && number <= spec.max
        ? { ok: true, value: number }
        : { ok: false, error: `Sveikas skaičius nuo ${spec.min} iki ${spec.max}.` };
    }

    case "decimal": {
      const number = Number(text.replace(",", "."));
      return Number.isFinite(number) && number >= spec.min && number <= spec.max
        ? { ok: true, value: Math.round(number * 100) / 100 }
        : { ok: false, error: `Skaičius nuo ${spec.min} iki ${spec.max}.` };
    }

    case "date":
      return isRealDate(text)
        ? { ok: true, value: text }
        : { ok: false, error: "Netinkama data." };

    case "choice":
      return spec.options.some((option) => option.value === text)
        ? { ok: true, value: text }
        : { ok: false, error: "Pasirinkite iš sąrašo." };
  }
}

export interface ParsedProfile {
  value: TruckProfile;
  errors: Partial<Record<TruckProfileField, string>>;
}

/** Visa kortelė iš formos teksto. Klaidos grąžinamos kartu, o ne po vieną. */
export function parseTruckProfile(
  values: Partial<Record<TruckProfileField, string>>,
): ParsedProfile {
  const value: Record<string, ParsedValue> = {};
  const errors: Partial<Record<TruckProfileField, string>> = {};

  for (const { field, spec } of PROFILE_FIELDS) {
    const parsed = parseOne(values[field] ?? "", spec);
    if (parsed.ok) {
      value[field] = parsed.value;
    } else {
      errors[field] = parsed.error;
    }
  }

  return { value: value as TruckProfile, errors };
}

/** Įrašyta kortelė atgal į formos tekstą. Nežinoma reikšmė – tuščias laukas. */
export function profileToFormValues(row: TruckProfile): Partial<Record<TruckProfileField, string>> {
  const values: Partial<Record<TruckProfileField, string>> = {};

  for (const { field, spec } of PROFILE_FIELDS) {
    const stored = row[field];
    if (stored == null) {
      values[field] = "";
    } else if (spec.kind === "decimal" && typeof stored === "number") {
      // Lietuviškai – su kableliu, kaip žmogus ir įveda.
      values[field] = String(stored).replace(".", ",");
    } else {
      values[field] = String(stored);
    }
  }

  return values;
}

/** Kiek dienų liko iki datos. Neigiamas – jau praėjo. `null` – data nežinoma. */
export function daysUntil(date: string | null | undefined, today: string): number | null {
  if (!date || !isRealDate(date) || !isRealDate(today)) return null;
  return Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
}

/** Per kiek dienų iki pabaigos dokumentas jau rodomas kaip skubus. */
export const DOCUMENT_WARNING_DAYS = 30;

export interface DocumentAlert {
  label: string;
  /** Neigiamas – jau pasibaigė. */
  days: number;
}

const DOCUMENT_LABELS: Record<
  "inspection_valid_until" | "insurance_valid_until" | "tachograph_calibration_until",
  string
> = {
  inspection_valid_until: "Techninė apžiūra",
  insurance_valid_until: "Draudimas",
  tachograph_calibration_until: "Tachografas",
};

/**
 * Dokumentai, kurie baigiasi per 30 dienų arba jau pasibaigė (#164).
 *
 * Skubiausias pirmas. Nežinoma data neįspėja: nežinoti nereiškia, kad
 * pasibaigė, o netikras įspėjimas mokytų įspėjimų nepaisyti.
 */
export function documentAlerts(row: TruckProfile, today: string): DocumentAlert[] {
  const alerts: DocumentAlert[] = [];

  for (const [field, label] of Object.entries(DOCUMENT_LABELS) as [
    keyof typeof DOCUMENT_LABELS,
    string,
  ][]) {
    const days = daysUntil(row[field], today);
    if (days !== null && days <= DOCUMENT_WARNING_DAYS) alerts.push({ label, days });
  }

  return alerts.sort((a, b) => a.days - b.days);
}

/** Įspėjimas žodžiais: „Draudimas pasibaigė prieš 3 d.“, „Tachografas – po 12 d.“ */
export function documentAlertText(alert: DocumentAlert): string {
  if (alert.days < 0) return `${alert.label} pasibaigė prieš ${-alert.days} d.`;
  if (alert.days === 0) return `${alert.label} baigiasi šiandien`;
  return `${alert.label} – po ${alert.days} d.`;
}
