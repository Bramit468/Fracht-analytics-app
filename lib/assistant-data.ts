/**
 * Duomenys pokalbio asistentui (#208).
 *
 * Trys dalys, kraunamos tik kai modelis jų paprašo ir po vieną kartą
 * klausimui: įmonės duomenų bazė (RLS – tik sava įmonė), Telematikos faktas
 * ir furų vietos. Telematikos nuorodos yra vienos įmonės, todėl jos tikrinamos
 * tuo pačiu `canUseTelematics`, kaip Analizės ir „Vyksta dabar“ puslapiuose.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AssistantContext, AssistantData, LiveData, TelematicsData } from "./assistant-tools";
import type { CountryTariff } from "./calc";
import { fetchCompanySettings } from "./company-settings";
import { listCustomers } from "./customers";
import { fetchEcbRates, toEuroCents } from "./ecb-rates";
import { liveTrucks, parseSnapshots } from "./telematics";
import { canUseTelematics } from "./telematics-access";
import { parseCanDaily, parseSupplies } from "./telematics-costs";
import { fetchTelematics } from "./telematics-feed";
import { addDays } from "./trip-progress";
import { buildTripSummaries } from "./trips";
import type { Trip, TripCountryLeg } from "../types/trip";
import type { Truck } from "../types/truck";

/** Kiek dienų tylintis objektas dar laikomas gyvu – kaip „Vyksta dabar“. */
const LIVE_SIGNAL_DAYS = 7;

async function loadData(client: SupabaseClient, today: string): Promise<AssistantData> {
  const [trips, legs, trucks, tariffs, customers, settings] = await Promise.all([
    client.from("trips").select("*").order("trip_date", { ascending: false }),
    client.from("trip_country_legs").select("*"),
    client.from("trucks").select("*").order("plate"),
    client.from("country_tariffs").select("country,rate,rate_type"),
    listCustomers(client),
    fetchCompanySettings(client),
  ]);
  const error = trips.error ?? legs.error ?? trucks.error ?? tariffs.error;
  if (error) throw error;

  const rawTrips = (trips.data ?? []) as Trip[];
  const allLegs = (legs.data ?? []) as TripCountryLeg[];
  const truckRows = (trucks.data ?? []) as Truck[];
  const tariffRows: CountryTariff[] = (tariffs.data ?? []).map((row) => ({
    country: row.country as string,
    rate: Number(row.rate),
    rateType: row.rate_type as CountryTariff["rateType"],
  }));

  return {
    trips: buildTripSummaries(rawTrips, allLegs, truckRows, tariffRows),
    rawTrips,
    legs: allLegs,
    tariffs: tariffRows,
    customers: customers.customers,
    trucks: truckRows,
    settings,
    today,
  };
}

async function loadTelematics(client: SupabaseClient): Promise<TelematicsData | null> {
  if (!(await canUseTelematics(client))) return null;
  const [canRaw, suppliesRaw, rates] = await Promise.all([
    fetchTelematics("canDaily"),
    fetchTelematics("supplies"),
    fetchEcbRates(),
  ]);
  const { supplies, issues } = parseSupplies(suppliesRaw, (amount, currency, date) =>
    toEuroCents(rates, amount, currency, date),
  );
  return { daily: parseCanDaily(canRaw), supplies, issues };
}

async function loadLive(client: SupabaseClient, plates: string[], today: string): Promise<LiveData | null> {
  if (!process.env.TELEMATIKA_SNAPSHOT_URL || !(await canUseTelematics(client))) return null;
  const rows = parseSnapshots(await fetchTelematics("snapshot"), `${addDays(today, -LIVE_SIGNAL_DAYS)} 00:00:00`);
  const now = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Vilnius" });
  return liveTrucks(rows, plates, now);
}

/** Kiekviena dalis įkeliama vieną kartą, net jei modelis kreipiasi kelis kartus. */
export function assistantContext(client: SupabaseClient, today: string): AssistantContext {
  let data: Promise<AssistantData> | null = null;
  let telematics: Promise<TelematicsData | null> | null = null;
  let live: Promise<LiveData | null> | null = null;

  const context: AssistantContext = {
    data: () => (data ??= loadData(client, today)),
    telematics: () => (telematics ??= loadTelematics(client)),
    live: () => (live ??= context.data().then((d) => loadLive(client, d.trucks.map((truck) => truck.plate), today))),
  };
  return context;
}
