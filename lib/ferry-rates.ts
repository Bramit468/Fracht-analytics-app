/**
 * Įmonės sutartinės keltų kainos (Phase 0, 6 punktas, migracija 0027).
 *
 * Krovininių keltų tarifai beveik niekur neskelbiami, o Baltijos keltų bilietai
 * Telematikoje nematyti (apmokami sąskaita). Todėl kainą įveda savininkas, o
 * skaičiuoklė ją ima, kai PTV maršrute randa tą keltą. Nieko neišgalvojama:
 * nėra kainos – lieka „kelto kaina nežinoma“, kaip iki šiol.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseEuroToCents } from "./money";

export interface FerryRate {
  id: string;
  /** „Klaipėda – Karlshamn“. Uostai lyginami su PTV kelto pavadinimu. */
  label: string;
  price_cents: number;
  note: string | null;
  updated_at: string;
}

/**
 * Maršrutai, kuriais plaukia LT vežėjai – pasirinkimui. Kainų čia nėra
 * sąmoningai: jos sutartinės. Mitrenos Telematikoje (2026-08–10) matyti tik
 * Norvegijos vidaus keltai (AutoPASS, ~2–3 tūkst. € per mėn.) – jie jau
 * įskaičiuojami iš pirkimų, todėl čia jų nereikia.
 */
export const FERRY_ROUTES: readonly { label: string; operator: string }[] = [
  { label: "Klaipėda – Karlshamn", operator: "DFDS" },
  { label: "Klaipėda – Kiel", operator: "DFDS" },
  { label: "Ventspils – Nynäshamn", operator: "Stena Line" },
  { label: "Liepāja – Travemünde", operator: "Stena Line" },
  { label: "Paldiski – Kapellskär", operator: "DFDS" },
  { label: "Tallinn – Helsinki", operator: "Tallink, Eckerö, Viking Line" },
  { label: "Gdynia – Karlskrona", operator: "Stena Line" },
  { label: "Świnoujście – Ystad", operator: "Unity Line, Polferries" },
  { label: "Rostock – Trelleborg", operator: "TT-Line, Stena Line" },
  { label: "Puttgarden – Rødby", operator: "Scandlines" },
  { label: "Helsingør – Helsingborg", operator: "ForSea" },
];

/** Be diakritikos ir mažosiomis: „Liepāja“ = „Liepaja“, „Rødby“ = „Rodby“. */
export function foldPort(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").replace(/ø/gi, "o").replace(/æ/gi, "ae").replace(/ł/gi, "l").toLowerCase();
}

/** Uostai iš pavadinimo: „Klaipėda – Karlshamn“ -> ["klaipeda", "karlshamn"]. */
export function ferryPorts(label: string): string[] {
  return label.split(/\s*[–—-]\s*|\s*\/\s*/).map((part) => foldPort(part.trim())).filter((part) => part.length >= 3);
}

/** Ar PTV kelto pavadinimas atitinka sutartį: visi sutarties uostai yra pavadinime. */
export function ferryMatches(ptvName: string, label: string): boolean {
  const name = foldPort(ptvName);
  const ports = ferryPorts(label);
  return ports.length >= 2 && ports.every((port) => name.includes(port));
}

export interface ContractFare {
  totalCents: number;
  /** „Klaipėda – Karlshamn 520,00 €“ – pastabai. */
  lines: { label: string; cents: number }[];
}

/**
 * Sutartinė kaina visiems maršruto keltams. `null`, jei bent vienam keltui
 * kainos nėra: pusė kainos atrodytų kaip visa, o tai blogiau nei „nežinoma“.
 */
export function contractFare(ptvNames: readonly string[], rates: readonly FerryRate[]): ContractFare | null {
  if (ptvNames.length === 0) return null;
  const lines: ContractFare["lines"] = [];
  for (const name of ptvNames) {
    const rate = rates.find((row) => ferryMatches(name, row.label));
    if (!rate) return null;
    lines.push({ label: rate.label, cents: rate.price_cents });
  }
  return { totalCents: lines.reduce((sum, line) => sum + line.cents, 0), lines };
}

export function parseFerryRate(label: string, price: string, note: string):
  { ok: true; value: Pick<FerryRate, "label" | "price_cents" | "note"> } | { ok: false; error: string } {
  const cleanLabel = label.trim().replace(/\s+/g, " ");
  if (ferryPorts(cleanLabel).length < 2) return { ok: false, error: "Įrašykite abu uostus, pvz. „Klaipėda – Karlshamn“." };
  if (cleanLabel.length > 80) return { ok: false, error: "Pavadinimas per ilgas." };
  const cents = parseEuroToCents(price.trim());
  if (cents === null || cents <= 0) return { ok: false, error: "Kainą įveskite eurais, pvz. 520 arba 520,50." };
  const cleanNote = note.trim().slice(0, 200);
  return { ok: true, value: { label: cleanLabel, price_cents: cents, note: cleanNote === "" ? null : cleanNote } };
}

/** Be 0027 – tuščias sąrašas: skaičiuoklė veikia kaip anksčiau. */
export async function listFerryRates(client: SupabaseClient): Promise<{ rates: FerryRate[]; available: boolean }> {
  const { data, error } = await client.from("ferry_rates").select("id,label,price_cents,note,updated_at").order("label");
  if (error) return { rates: [], available: !(error.code === "42P01" || error.code === "PGRST205") };
  return { rates: (data ?? []) as FerryRate[], available: true };
}
