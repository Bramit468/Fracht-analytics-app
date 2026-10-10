/**
 * Užsakovai (#183).
 *
 * Užsakovas renkamas iš sąrašo arba įrašomas naujas tiesiai reiso formoje –
 * atskiro „sukurk užsakovą“ žingsnio prieš kiekvieną naują klientą žmonės
 * nedaro, ir laukas liktų tuščias.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { groupProfit, type ProfitGroup } from "./group-profit";
import type { TripSummary } from "./trips";

export interface Customer {
  id: string;
  name: string;
}

const MAX_NAME = 200;

/** Pavadinimas, kaip jis saugomas: be kraštinių ir pasikartojančių tarpų. */
export function normalizeCustomerName(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * Raktas palyginimui: „UAB Omniva“, „uab omniva“ ir „UAB  Omniva“ – tas pats
 * užsakovas. Kitaip vienas klientas pasidalintų į kelis, ir jo pelnas taip pat.
 */
export function customerKey(text: string): string {
  return normalizeCustomerName(text).toLocaleLowerCase("lt-LT");
}

export type ParsedCustomerName = { ok: true; value: string | null } | { ok: false; error: string };

/** Tuščias – reisas be užsakovo. */
export function parseCustomerName(text: string): ParsedCustomerName {
  const name = normalizeCustomerName(text);
  if (name === "") return { ok: true, value: null };
  if (name.length > MAX_NAME) return { ok: false, error: `Užsakovo pavadinimas – daugiausia ${MAX_NAME} simbolių.` };
  return { ok: true, value: name };
}

export function findCustomer(customers: Customer[], name: string): Customer | null {
  const key = customerKey(name);
  return customers.find((customer) => customerKey(customer.name) === key) ?? null;
}

export interface CustomerProfit extends Omit<ProfitGroup, "key"> {
  /** `null` – reisai be užsakovo. */
  customerId: string | null;
  name: string;
}

export const NO_CUSTOMER_LABEL = "Be užsakovo";

/**
 * Pelningumas pagal užsakovą, pelningiausias viršuje. Reisai be užsakovo
 * rodomi atskira eilute gale – jų neišmetame, kad sumos sutaptų su suvestine.
 */
export function summarizeByCustomer(trips: TripSummary[], customers: Customer[]): CustomerProfit[] {
  const names = new Map(customers.map((customer) => [customer.id, customer.name]));
  const groups = groupProfit(trips, (trip) => trip.customerId ?? "");

  const rows = groups.map(({ key, ...totals }) => ({
    customerId: key === "" ? null : key,
    // Užsakovas galėjo būti ištrintas, kol sąrašas buvo atidarytas.
    name: key === "" ? NO_CUSTOMER_LABEL : (names.get(key) ?? "Nežinomas užsakovas"),
    ...totals,
  }));

  return [...rows.filter((row) => row.customerId !== null), ...rows.filter((row) => row.customerId === null)];
}

/** Postgres/PostgREST kodas, kai lentelės nėra – migracija 0014 nepaleista. */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

/** `available: false` – migracija 0014 dar nepaleista. */
export async function listCustomers(client: SupabaseClient): Promise<{ customers: Customer[]; available: boolean }> {
  const { data, error } = await client.from("customers").select("id,name").order("name");
  if (isMissingTable(error)) return { customers: [], available: false };
  if (error) throw error;
  return { customers: (data ?? []) as Customer[], available: true };
}

/**
 * Randa esamą užsakovą arba sukuria naują. Jei kitas darbuotojas ką tik
 * sukūrė tą patį, unikalus raktas sukūrimą atmeta – tada imamas jo įrašas.
 */
export async function ensureCustomer(client: SupabaseClient, customers: Customer[], name: string): Promise<Customer> {
  const existing = findCustomer(customers, name);
  if (existing) return existing;

  const { data, error } = await client.from("customers").insert({ name }).select("id,name").single();
  if (!error) return data as Customer;

  if (error.code === "23505") {
    const { customers: fresh } = await listCustomers(client);
    const found = findCustomer(fresh, name);
    if (found) return found;
  }
  if (isMissingTable(error)) {
    throw new Error("Užsakovų dar negalima išsaugoti – Supabase paleiskite migraciją 0014.");
  }
  throw error;
}
