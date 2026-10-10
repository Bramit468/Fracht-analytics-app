/**
 * Užsakovai (#183).
 *
 * Užsakovas renkamas iš sąrašo arba įrašomas naujas tiesiai reiso formoje –
 * atskiro „sukurk užsakovą“ žingsnio prieš kiekvieną naują klientą žmonės
 * nedaro, ir laukas liktų tuščias.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { groupProfit, type ProfitGroup } from "./group-profit";
import { summarizePayments, type PaymentSummary, type PaymentTrip } from "./payments";
import type { TripSummary } from "./trips";

export interface Customer {
  id: string;
  name: string;
  /** Apmokėjimo terminas dienomis (migracija 0015, #185). `undefined` – stulpelio nėra. */
  payment_terms_days?: number | null;
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

/**
 * Apmokėjimai pagal užsakovą (#185). Raktas – užsakovo id; reisai be
 * užsakovo neturi termino, todėl čia neįtraukiami.
 */
export function paymentsByCustomer(
  trips: TripSummary[],
  customers: Customer[],
  today: string,
): Map<string, PaymentSummary> {
  const terms = new Map(customers.map((customer) => [customer.id, customer.payment_terms_days ?? null]));
  const byCustomer = new Map<string, PaymentTrip[]>();

  for (const trip of trips) {
    if (!trip.customerId) continue;
    const list = byCustomer.get(trip.customerId) ?? [];
    list.push({
      invoicedOn: trip.invoicedOn ?? null,
      paidOn: trip.paidOn ?? null,
      termsDays: terms.get(trip.customerId) ?? null,
      revenueCents: trip.revenueCents,
    });
    byCustomer.set(trip.customerId, list);
  }

  return new Map([...byCustomer].map(([id, list]) => [id, summarizePayments(list, today)]));
}

export type ParsedTerms = { ok: true; value: number | null } | { ok: false; error: string };

/** Terminas dienomis iš formos teksto. Tuščias – nežinomas. */
export function parsePaymentTerms(text: string): ParsedTerms {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, value: null };
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0 || value > 365) {
    return { ok: false, error: "Terminas – sveikas dienų skaičius nuo 0 iki 365." };
  }
  return { ok: true, value };
}

export async function updatePaymentTerms(client: SupabaseClient, id: string, days: number | null): Promise<void> {
  const { data, error } = await client.from("customers").update({ payment_terms_days: days }).eq("id", id).select("id");
  if (error?.code === "42703" || error?.code === "PGRST204") {
    throw new Error("Terminų dar nėra duomenų bazėje – Supabase paleiskite migraciją 0015.");
  }
  if (error) throw error;
  if (!data?.length) throw new Error("Užsakovas nerastas.");
}

/** Postgres/PostgREST kodas, kai lentelės nėra – migracija 0014 nepaleista. */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

/** `available: false` – migracija 0014 dar nepaleista. */
export async function listCustomers(client: SupabaseClient): Promise<{ customers: Customer[]; available: boolean }> {
  // `*`, o ne stulpelių sąrašas: termino stulpelis atsiranda tik su 0015.
  const { data, error } = await client.from("customers").select("*").order("name");
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
