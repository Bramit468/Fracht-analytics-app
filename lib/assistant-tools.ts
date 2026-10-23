/**
 * Pokalbio asistento įrankiai („Klausk Bramit“).
 *
 * Modelis pats nieko neskaičiuoja: jis renkasi įrankį, o skaičius pateikia tos
 * pačios funkcijos, kurios piešia suvestinę ir lenteles. Taip atsakymas
 * negali išsiskirti su tuo, ką žmogus mato ekrane, ir modelio aritmetikos
 * klaida nevirsta neteisingu pelnu.
 *
 * Sumos grąžinamos jau suformatuotos („1 234,56 €“): centų perskaičiavimas
 * modelyje būtų dar viena vieta suklysti.
 */

import type { FunctionTool } from "openai/resources/responses/responses";

import { calcDailyRate } from "./calc";
import { calculateDashboardStats } from "./dashboard";
import { summarizeByCustomer, customerKey, type Customer } from "./customers";
import { groupProfit, type ProfitGroup } from "./group-profit";
import { formatCents } from "./money";
import { tripMonth } from "./monthly";
import { paymentState, paymentStateText, summarizePayments } from "./payments";
import { summarizeByRoute } from "./route-profit";
import { plateKey } from "./telematics-costs";
import { truckRowToCalc } from "./truck";
import { summarizeByTruck } from "./truck-profit";
import type { TripSummary } from "./trips";
import type { Truck } from "../types/truck";

export interface AssistantData {
  trips: TripSummary[];
  customers: Customer[];
  trucks: Truck[];
  /** Šiandiena Vilniaus laiku, YYYY-MM-DD. */
  today: string;
}

export interface TripFilter {
  from: string | null;
  to: string | null;
  plate: string | null;
  customer: string | null;
}

const MAX_ROWS = 30;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Klaida, kurią modelis gauna kaip įrankio atsakymą ir gali pasitaisyti. */
export class ToolInputError extends Error {}

// --- Formatavimas -----------------------------------------------------------

/** Lietuviškai: kablelis ir tikras minusas, kaip ir sumose („−100,00 €“). */
function decimal(value: number, places: number): string {
  return value.toFixed(places).replace(".", ",").replace("-", "−");
}

function percent(value: number | null): string | null {
  return value === null ? null : `${decimal(value, 1)} %`;
}

function perKm(value: number | null): string | null {
  return value === null ? null : `${decimal(value, 2)} €/km`;
}

function money(cents: number | null): string | null {
  return cents === null ? null : formatCents(cents);
}

function groupRow(label: string, group: Omit<ProfitGroup, "key">) {
  return {
    pavadinimas: label,
    reisai: group.tripCount,
    pajamos: money(group.revenueCents),
    kastai: money(group.totalCostCents),
    pelnas: money(group.profitCents),
    marza: percent(group.marginPercent),
    savikaina_uz_km: perKm(group.costPerKm),
    pelnas_uz_km: perKm(group.profitPerKm),
    pelnas_per_para: money(group.profitPerDayCents),
    apmokami_km: Math.round(group.paidKm),
    paros: group.days,
  };
}

// --- Argumentai -------------------------------------------------------------

function record(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw === "" ? "{}" : raw);
  } catch {
    throw new ToolInputError("Argumentai nėra tinkamas JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ToolInputError("Argumentai turi būti objektas.");
  }
  return parsed as Record<string, unknown>;
}

function optionalText(args: Record<string, unknown>, name: string): string | null {
  const value = args[name];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ToolInputError(`${name} turi būti tekstas arba null.`);
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function optionalDate(args: Record<string, unknown>, name: string): string | null {
  const value = optionalText(args, name);
  if (value !== null && !DATE.test(value)) {
    throw new ToolInputError(`${name} turi būti data formatu YYYY-MM-DD.`);
  }
  return value;
}

function oneOf<T extends string>(args: Record<string, unknown>, name: string, allowed: readonly T[], fallback: T): T {
  const value = optionalText(args, name);
  if (value === null) return fallback;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new ToolInputError(`${name} turi būti vienas iš: ${allowed.join(", ")}.`);
  }
  return value as T;
}

function limit(args: Record<string, unknown>, fallback: number): number {
  const value = args.limit;
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ToolInputError("limit turi būti teigiamas sveikasis skaičius.");
  }
  return Math.min(value, MAX_ROWS);
}

export function parseFilter(args: Record<string, unknown>): TripFilter {
  const filter = {
    from: optionalDate(args, "from"),
    to: optionalDate(args, "to"),
    plate: optionalText(args, "plate"),
    customer: optionalText(args, "customer"),
  };
  if (filter.from && filter.to && filter.from > filter.to) {
    throw new ToolInputError("from negali būti vėlesnė už to.");
  }
  return filter;
}

// --- Atranka ----------------------------------------------------------------

/**
 * Reisai pagal datas (imtinai), furą ir užsakovą. Fura lyginama be tarpų,
 * užsakovas – pagal pavadinimo dalį, nes žmogus rašo „Girteka“, o ne pilną
 * „UAB Girteka Logistics“.
 */
export function filterTrips(data: AssistantData, filter: TripFilter): TripSummary[] {
  const plate = filter.plate === null ? null : plateKey(filter.plate);
  const customerIds = filter.customer === null
    ? null
    : new Set(
      data.customers
        .filter((customer) => customerKey(customer.name).includes(customerKey(filter.customer ?? "")))
        .map((customer) => customer.id),
    );

  return data.trips.filter((trip) =>
    (filter.from === null || trip.tripDate >= filter.from)
    && (filter.to === null || trip.tripDate <= filter.to)
    && (plate === null || plateKey(trip.truckPlate) === plate)
    && (customerIds === null || (trip.customerId != null && customerIds.has(trip.customerId))),
  );
}

function filterEcho(filter: TripFilter) {
  return {
    nuo: filter.from ?? "pradžios",
    iki: filter.to ?? "šiandien",
    ...(filter.plate ? { fura: filter.plate } : {}),
    ...(filter.customer ? { uzsakovas: filter.customer } : {}),
  };
}

// --- Įrankiai ---------------------------------------------------------------

function getSummary(data: AssistantData, args: Record<string, unknown>) {
  const filter = parseFilter(args);
  const trips = filterTrips(data, filter);
  const stats = calculateDashboardStats(trips);
  const emptyKm = trips.reduce((total, trip) => total + trip.emptyKm, 0);
  const paidKm = trips.reduce((total, trip) => total + trip.paidKm, 0);

  return {
    atranka: filterEcho(filter),
    reisai: stats.tripCount,
    pajamos: money(stats.revenueCents),
    kastai: money(stats.totalCostCents),
    pelnas: money(stats.profitCents),
    marza: percent(stats.marginPercent),
    savikaina_uz_km: perKm(stats.costPerKm),
    pelnas_uz_km: perKm(stats.profitPerKm),
    pelnas_per_para: money(stats.profitPerDayCents),
    apmokami_km: Math.round(paidKm),
    tuscia_km: Math.round(emptyKm),
    nuostolingi_reisai: trips.filter((trip) => trip.profitCents < 0).length,
  };
}

const GROUPS = ["truck", "route", "customer", "month"] as const;
const ORDERS = ["best", "worst"] as const;

function profitBy(data: AssistantData, args: Record<string, unknown>) {
  const filter = parseFilter(args);
  const group = oneOf(args, "group", GROUPS, "truck");
  const order = oneOf(args, "order", ORDERS, "best");
  const trips = filterTrips(data, filter);

  const entries: { label: string; totals: Omit<ProfitGroup, "key"> }[] = group === "truck"
    ? summarizeByTruck(trips).map(({ plate, ...totals }) => ({ label: plate, totals }))
    : group === "route"
      ? summarizeByRoute(trips).map(({ origin, destination, ...totals }) => ({ label: `${origin} → ${destination}`, totals }))
      : group === "customer"
        ? summarizeByCustomer(trips, data.customers).map((row) => ({ label: row.name, totals: row }))
        : groupProfit(trips, (trip) => tripMonth(trip.tripDate))
          .sort((a, b) => a.key.localeCompare(b.key))
          .map(({ key, ...totals }) => ({ label: key, totals }));

  // Mėnesiai lieka chronologiški, kai klausiama eigos; kitur – pagal pelną.
  // `sort` stabilus, todėl vienodo pelno eilutės lieka savo tvarka.
  const ordered = order === "worst"
    ? [...entries].sort((a, b) => a.totals.profitCents - b.totals.profitCents)
    : group === "month"
      ? entries
      : [...entries].sort((a, b) => b.totals.profitCents - a.totals.profitCents);
  const count = limit(args, group === "month" ? 12 : 10);
  // Chronologiškai rodomi paskutiniai mėnesiai, ne pirmieji.
  const shown = group === "month" && order === "best" ? ordered.slice(-count) : ordered.slice(0, count);

  return {
    atranka: filterEcho(filter),
    grupuota_pagal: group,
    is_viso_grupiu: entries.length,
    rodoma: shown.length,
    eilutes: shown.map(({ label, totals }) => groupRow(label, totals)),
  };
}

const SORTS = ["date", "profit_desc", "profit_asc", "margin_asc"] as const;

function listTrips(data: AssistantData, args: Record<string, unknown>) {
  const filter = parseFilter(args);
  const sort = oneOf(args, "sort", SORTS, "date");
  const customersById = new Map(data.customers.map((customer) => [customer.id, customer.name]));
  const trips = [...filterTrips(data, filter)];

  trips.sort((a, b) => {
    switch (sort) {
      case "profit_desc": return b.profitCents - a.profitCents;
      case "profit_asc": return a.profitCents - b.profitCents;
      // Reisai be maržos (be pajamų) – gale, ne pradžioje.
      case "margin_asc": return (a.marginPercent ?? Infinity) - (b.marginPercent ?? Infinity);
      case "date": return b.tripDate.localeCompare(a.tripDate);
    }
  });

  const shown = trips.slice(0, limit(args, 15));
  return {
    atranka: filterEcho(filter),
    is_viso_reisu: trips.length,
    rodoma: shown.length,
    reisai: shown.map((trip) => ({
      data: trip.tripDate,
      numeris: trip.tripNumber,
      marsrutas: `${trip.origin} → ${trip.destination}`,
      fura: trip.truckPlate,
      uzsakovas: trip.customerId ? (customersById.get(trip.customerId) ?? null) : null,
      pajamos: money(trip.revenueCents),
      kastai: money(trip.totalCostCents),
      pelnas: money(trip.profitCents),
      marza: percent(trip.marginPercent),
      pelnas_per_para: money(trip.profitPerDayCents),
      paros: trip.days,
      apmokami_km: trip.paidKm,
      tuscia_km: trip.emptyKm,
    })),
  };
}

function truckCosts(data: AssistantData) {
  return {
    furos: data.trucks.map((truck) => {
      let daily: number | null = null;
      try {
        daily = calcDailyRate(truckRowToCalc(truck));
      } catch {
        // Neteisingi furos duomenys (pvz. 0 darbo dienų) – geriau „nežinoma“, nei klaida.
      }
      return {
        fura: truck.plate,
        marke: [truck.make, truck.model].filter(Boolean).join(" ") || null,
        paros_savikaina: money(daily),
        priekabos_nuoma_per_men: money(truck.trailer_monthly_cents),
      };
    }),
    pastaba: "Paros savikaina – dabartinė. Išsaugoti reisai skaičiuoti su tuo metu galiojusia kopija.",
  };
}

function payments(data: AssistantData, args: Record<string, unknown>) {
  const filter = parseFilter(args);
  const trips = filterTrips(data, filter);
  if (trips.some((trip) => trip.invoicedOn === undefined)) {
    return { klaida: "Apmokėjimų datų duomenų bazėje dar nėra." };
  }

  const termsById = new Map(data.customers.map((customer) => [customer.id, customer.payment_terms_days ?? null]));
  const customersById = new Map(data.customers.map((customer) => [customer.id, customer.name]));
  const withTerms = trips.map((trip) => ({
    trip,
    payment: {
      invoicedOn: trip.invoicedOn ?? null,
      paidOn: trip.paidOn ?? null,
      termsDays: trip.customerId ? (termsById.get(trip.customerId) ?? null) : null,
      revenueCents: trip.revenueCents,
    },
  }));
  const summary = summarizePayments(withTerms.map(({ payment }) => payment), data.today);
  const overdue = withTerms
    .map(({ trip, payment }) => ({ trip, state: paymentState(payment, data.today) }))
    .filter(({ state }) => state.status === "overdue")
    .sort((a, b) => (b.state.daysLate ?? 0) - (a.state.daysLate ?? 0))
    .slice(0, limit(args, 15));

  return {
    atranka: filterEcho(filter),
    laukiama_apmokejimo: money(summary.openCents),
    is_ju_veluoja: money(summary.overdueCents),
    veluojanciu_saskaitu: summary.overdueCount,
    apmoketa_saskaitu: summary.paidCount,
    apmoketa_pavelavus: summary.paidLateCount,
    vidutiniskai_dienu_iki_apmokejimo: summary.avgDaysToPay === null ? null : Math.round(summary.avgDaysToPay),
    veluojancios: overdue.map(({ trip, state }) => ({
      numeris: trip.tripNumber,
      uzsakovas: trip.customerId ? (customersById.get(trip.customerId) ?? null) : null,
      suma: money(trip.revenueCents),
      busena: paymentStateText(state),
    })),
  };
}

// --- Aprašai modeliui -------------------------------------------------------

const FILTER_PROPERTIES = {
  from: { type: ["string", "null"], description: "Reiso data nuo (imtinai), YYYY-MM-DD. null – be ribos." },
  to: { type: ["string", "null"], description: "Reiso data iki (imtinai), YYYY-MM-DD. null – be ribos." },
  plate: { type: ["string", "null"], description: "Furos valstybinis numeris, pvz. „NNN 888“. null – visos furos." },
  customer: { type: ["string", "null"], description: "Užsakovo pavadinimas ar jo dalis. null – visi užsakovai." },
} as const;

function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
): FunctionTool {
  return {
    type: "function",
    name,
    description,
    strict: true,
    parameters: {
      type: "object",
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    },
  };
}

export const ASSISTANT_TOOLS: FunctionTool[] = [
  tool(
    "get_summary",
    "Bendri išsaugotų reisų skaičiai: reisų skaičius, pajamos, kaštai, pelnas, marža, savikaina ir pelnas už km, pelnas per parą, tuščia rida. Su atranka pagal datas, furą, užsakovą.",
    FILTER_PROPERTIES,
  ),
  tool(
    "profit_by",
    "Pelningumas sugrupuotas pagal furą, kryptį (maršrutą), užsakovą arba mėnesį. Tinka klausimams „kuri fura / kryptis / užsakovas uždirba daugiausia ar mažiausia“ ir mėnesių eigai.",
    {
      ...FILTER_PROPERTIES,
      group: { type: "string", enum: [...GROUPS], description: "truck – fura, route – kryptis, customer – užsakovas, month – mėnuo (chronologiškai)." },
      order: { type: "string", enum: [...ORDERS], description: "best – pelningiausi pirmi (mėnesiai – chronologiškai), worst – mažiausio pelno pirmi." },
      limit: { type: ["integer", "null"], description: `Kiek eilučių grąžinti, iki ${MAX_ROWS}. null – 10 (mėnesių – 12).` },
    },
  ),
  tool(
    "list_trips",
    "Atskiri reisai su pajamomis, kaštais, pelnu ir marža. Tinka konkretiems reisams rasti, pvz. nuostolingiausiems ar paskutiniams.",
    {
      ...FILTER_PROPERTIES,
      sort: { type: "string", enum: [...SORTS], description: "date – naujausi pirmi, profit_desc / profit_asc – pagal pelną, margin_asc – mažiausia marža pirma." },
      limit: { type: ["integer", "null"], description: `Kiek reisų grąžinti, iki ${MAX_ROWS}. null – 15.` },
    },
  ),
  tool(
    "truck_costs",
    "Kiekvienos furos dabartinė paros savikaina ir priekabos nuoma.",
    {},
  ),
  tool(
    "payments",
    "Sąskaitos ir apmokėjimai: kiek laukiama, kiek vėluoja, kurie užsakovai vėluoja mokėti.",
    {
      ...FILTER_PROPERTIES,
      limit: { type: ["integer", "null"], description: `Kiek vėluojančių sąskaitų išvardyti, iki ${MAX_ROWS}. null – 15.` },
    },
  ),
];

/** Vykdo įrankį. Neteisingi argumentai grąžinami modeliui kaip klaida, o ne metami. */
export function runAssistantTool(name: string, rawArgs: string, data: AssistantData): unknown {
  try {
    const args = record(rawArgs);
    switch (name) {
      case "get_summary": return getSummary(data, args);
      case "profit_by": return profitBy(data, args);
      case "list_trips": return listTrips(data, args);
      case "truck_costs": return truckCosts(data);
      case "payments": return payments(data, args);
      default: return { klaida: `Nežinomas įrankis: ${name}` };
    }
  } catch (cause) {
    if (cause instanceof ToolInputError) return { klaida: cause.message };
    throw cause;
  }
}
