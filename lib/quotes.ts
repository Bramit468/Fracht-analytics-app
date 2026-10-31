/**
 * Pasiūlymų žurnalas (Phase 0, 5 punktas, migracija 0026).
 *
 * Kiekvienas suskaičiuotas pasiūlymas su Bramit verdiktu, dispečerio sprendimu
 * ir rezultatu. Iš jo matyti, ar skaičiuoklė naudojama (Gate 0: du dispečeriai,
 * 100 pasiūlymų) ir ar jos verdiktai pasitvirtina.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseEuroToCents } from "./money";
import type { OfferSource } from "./offer-parse";
import type { QuoteVerdict, QuoteVerdictKind } from "./quote-verdict";
import type { StoredStop } from "./stops";

export type QuoteSource = "manual" | OfferSource;
export type QuoteDecision = "pending" | "taken" | "negotiating" | "declined";
export type QuoteOutcome = "open" | "won" | "lost";

export interface QuoteRow {
  id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  truck_id: string | null;
  trip_date: string | null;
  stops: StoredStop[];
  origin: string;
  destination: string;
  customer_id: string | null;
  source: QuoteSource;
  offer_text: string | null;
  offered_price_cents: number | null;
  paid_km: number | null;
  empty_km: number | null;
  days: number | null;
  total_cost_cents: number | null;
  contribution_cents: number | null;
  contribution_per_day_cents: number | null;
  verdict: QuoteVerdictKind | null;
  target_price_cents: number | null;
  decision: QuoteDecision;
  outcome: QuoteOutcome;
  final_price_cents: number | null;
  reason: string | null;
  trip_id: string | null;
}

/** Kas įrašoma skaičiuojant – be sprendimo, kurį žmogus priima vėliau. */
export type QuoteDraft = Pick<QuoteRow,
  | "truck_id" | "trip_date" | "stops" | "origin" | "destination" | "customer_id" | "source" | "offer_text"
  | "offered_price_cents" | "paid_km" | "empty_km" | "days" | "total_cost_cents" | "contribution_cents"
  | "contribution_per_day_cents" | "verdict" | "target_price_cents">;

export type QuoteDecisionPatch = Pick<QuoteRow, "decision" | "outcome" | "final_price_cents" | "reason">;

export const DECISION_LABELS: Record<QuoteDecision, string> = {
  pending: "Nespręsta",
  taken: "Paėmėm",
  negotiating: "Deramės",
  declined: "Nepaėmėm",
};

export const OUTCOME_LABELS: Record<QuoteOutcome, string> = {
  open: "Atviras",
  won: "Laimėtas",
  lost: "Pralaimėtas",
};

export const VERDICT_LABELS: Record<QuoteVerdictKind, string> = {
  take: "Imti",
  negotiate: "Derėtis",
  reject: "Neimti",
};

export const SOURCE_LABELS: Record<QuoteSource, string> = {
  manual: "Ranka",
  timocom: "Timocom",
  transeu: "Trans.eu",
  unknown: "Įklijuota",
};

export const QUOTE_REASONS = [
  "Per brangu užsakovui",
  "Nėra laisvos furos",
  "Per mažas įnašas",
  "Užsakovas neatsakė",
  "Kita",
] as const;

export interface QuoteDraftInput {
  truckId: string | null;
  tripDate: string | null;
  stops: StoredStop[];
  customerId: string | null;
  source: QuoteSource;
  offerText: string | null;
  priceCents: number;
  paidKm: number;
  emptyKm: number;
  days: number;
  totalCostCents: number;
  contributionCents: number;
  verdict: QuoteVerdict;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Formos skaičiai -> žurnalo eilutė. Km ir paros – tiek skaitmenų, kiek leidžia stulpelis. */
export function buildQuoteDraft(input: QuoteDraftInput): QuoteDraft {
  const first = input.stops[0];
  const last = input.stops[input.stops.length - 1];
  return {
    truck_id: input.truckId || null,
    trip_date: input.tripDate || null,
    stops: input.stops,
    origin: first?.address.trim() ?? "",
    destination: last?.address.trim() ?? "",
    customer_id: input.customerId,
    source: input.source,
    offer_text: input.offerText ? input.offerText.slice(0, 4000) : null,
    offered_price_cents: input.priceCents,
    paid_km: round(input.paidKm, 2),
    empty_km: round(input.emptyKm, 2),
    days: round(input.days, 3),
    total_cost_cents: input.totalCostCents,
    contribution_cents: input.contributionCents,
    contribution_per_day_cents: input.verdict.contributionPerDayCents,
    verdict: input.verdict.kind,
    target_price_cents: input.verdict.targetPriceCents,
  };
}

/**
 * Kada tai „tas pats“ pasiūlymas. Kaina ir fura – ne: jas keičiant pasiūlymas
 * tik perskaičiuojamas. Kiti adresai ar data – jau kitas krovinys.
 */
export function quoteKey(stops: StoredStop[], tripDate: string | null): string {
  const places = stops.map((stop) => stop.point || stop.address.trim().toLowerCase());
  return `${tripDate ?? ""}|${places.join(">")}`;
}

export type QuoteLogAction = "insert" | "update" | "skip";

/**
 * Ką daryti su nauju skaičiavimu: dar nespręstas pasiūlymas atnaujinamas (net
 * pakeitus adresus – tai vis dar tas pats bandymas), o jau nuspręsto skaičiai
 * užšaldyti – kitas krovinys gauna naują eilutę.
 */
export function quoteLogAction(current: { id: string | null; key: string; decided: boolean }, nextKey: string): QuoteLogAction {
  if (!current.id) return "insert";
  if (!current.decided) return "update";
  return current.key === nextKey ? "skip" : "insert";
}

/** Mygtukas -> eilutės pakeitimas. Galutinė kaina neprivaloma, bet jei įvesta – griežtai eurais. */
export function decisionPatch(
  decision: Exclude<QuoteDecision, "pending">,
  finalPriceText: string,
  reason: string,
): { ok: true; patch: QuoteDecisionPatch } | { ok: false; error: string } {
  const text = finalPriceText.trim();
  const finalPrice = text === "" ? null : parseEuroToCents(text);
  if (text !== "" && finalPrice === null) return { ok: false, error: "Galutinę kainą įveskite eurais, pvz. 1450 arba 1450,50." };
  const cleanReason = reason.trim().slice(0, 500);
  return {
    ok: true,
    patch: {
      decision,
      outcome: decision === "taken" ? "won" : decision === "declined" ? "lost" : "open",
      final_price_cents: finalPrice,
      reason: cleanReason === "" ? null : cleanReason,
    },
  };
}

/**
 * Ar dispečeris elgėsi taip, kaip siūlė Bramit. „Imti“ – paėmė; „Neimti“ –
 * nepaėmė; „Derėtis“ – derasi, nepaėmė arba paėmė ne pigiau už X.
 * `null` – dar nenuspręsta arba verdikto nebuvo.
 */
export function followedVerdict(row: Pick<QuoteRow, "verdict" | "decision" | "final_price_cents" | "target_price_cents">): boolean | null {
  if (row.decision === "pending" || row.verdict === null) return null;
  if (row.verdict === "take") return row.decision === "taken";
  if (row.verdict === "reject") return row.decision === "declined";
  if (row.decision !== "taken") return true;
  return row.final_price_cents !== null && row.target_price_cents !== null && row.final_price_cents >= row.target_price_cents;
}

/** Darbo dienos (pirm.–penkt.) tarp dviejų datų imtinai. */
export function workingDays(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  let count = 0;
  for (let at = start; at <= end; at += 86_400_000) {
    const day = new Date(at).getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

export interface QuoteFilters {
  from: string;
  to: string;
  decision: QuoteDecision | "";
  outcome: QuoteOutcome | "";
  createdBy: string;
}

/** Laikotarpis – pagal įrašymo dieną Vilniaus laiku (`localDay`). */
export function filterQuotes(rows: QuoteRow[], filters: QuoteFilters, localDay: (iso: string) => string): QuoteRow[] {
  return rows.filter((row) => {
    const day = localDay(row.created_at);
    return day >= filters.from && day <= filters.to
      && (!filters.decision || row.decision === filters.decision)
      && (!filters.outcome || row.outcome === filters.outcome)
      && (!filters.createdBy || row.created_by === filters.createdBy);
  });
}

export interface QuoteStats {
  count: number;
  decided: number;
  won: number;
  lost: number;
  /** Laimėti nuo baigtų (laimėti + pralaimėti). `null`, kai baigtų nėra. */
  winRate: number | null;
  /** Kiek kartų sprendimas sutapo su verdiktu, nuo nuspręstų. */
  followedRate: number | null;
  workingDays: number;
  byDispatcher: { createdBy: string | null; count: number; perWorkingDay: number | null }[];
  reasons: { reason: string; count: number }[];
}

export function quoteStats(rows: QuoteRow[], from: string, to: string): QuoteStats {
  const won = rows.filter((row) => row.outcome === "won").length;
  const lost = rows.filter((row) => row.outcome === "lost").length;
  const judged = rows.map(followedVerdict).filter((value): value is boolean => value !== null);
  const days = workingDays(from, to);

  const perPerson = new Map<string | null, number>();
  for (const row of rows) perPerson.set(row.created_by, (perPerson.get(row.created_by) ?? 0) + 1);
  const reasons = new Map<string, number>();
  for (const row of rows) if (row.reason) reasons.set(row.reason, (reasons.get(row.reason) ?? 0) + 1);

  return {
    count: rows.length,
    decided: rows.filter((row) => row.decision !== "pending").length,
    won,
    lost,
    winRate: won + lost > 0 ? (won / (won + lost)) * 100 : null,
    followedRate: judged.length > 0 ? (judged.filter(Boolean).length / judged.length) * 100 : null,
    workingDays: days,
    byDispatcher: [...perPerson.entries()]
      .map(([createdBy, count]) => ({ createdBy, count, perWorkingDay: days > 0 ? count / days : null }))
      .sort((a, b) => b.count - a.count),
    reasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}

/** „Paversti reisu“: kaina – galutinė, jei sutarta, kitaip pasiūlyta. */
export function quoteTripPrice(row: Pick<QuoteRow, "final_price_cents" | "offered_price_cents">): number | null {
  return row.final_price_cents ?? row.offered_price_cents;
}

// --- Duomenų bazė -------------------------------------------------------------

const QUOTE_COLUMNS = "id,created_by,created_at,updated_at,truck_id,trip_date,stops,origin,destination,customer_id,source,offer_text,offered_price_cents,paid_km,empty_km,days,total_cost_cents,contribution_cents,contribution_per_day_cents,verdict,target_price_cents,decision,outcome,final_price_cents,reason,trip_id";

/** Postgres grąžina `numeric` kaip tekstą – žurnale jie skaičiai. */
function fromDb(row: Record<string, unknown>): QuoteRow {
  const number = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  return {
    ...(row as unknown as QuoteRow),
    paid_km: number(row.paid_km),
    empty_km: number(row.empty_km),
    days: number(row.days),
    stops: Array.isArray(row.stops) ? (row.stops as StoredStop[]) : [],
  };
}

/** Lentelės nėra (0026 nepaleista) – tada žurnalas tyliai neišjungiamas, o pasakoma. */
export function isMissingQuotesTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "42P01" || error.code === "PGRST205" || (/quotes/.test(message) && /does not exist|schema cache/.test(message));
}

export class QuoteLogError extends Error {}

function quoteError(error: { code?: string; message?: string }): QuoteLogError {
  return new QuoteLogError(isMissingQuotesTable(error)
    ? "Pasiūlymų žurnalo duomenų bazėje dar nėra – reikia migracijos 0026."
    : "Pasiūlymas į žurnalą neįrašytas – patikrinkite ryšį.");
}

export async function insertQuote(client: SupabaseClient, draft: QuoteDraft): Promise<string> {
  const { data, error } = await client.from("quotes").insert(draft).select("id").single();
  if (error) throw quoteError(error);
  return (data as { id: string }).id;
}

export async function updateQuote(client: SupabaseClient, id: string, patch: Partial<QuoteDraft & QuoteDecisionPatch & Pick<QuoteRow, "trip_id">>): Promise<void> {
  const { error } = await client.from("quotes").update(patch).eq("id", id);
  if (error) throw quoteError(error);
}

export async function getQuote(client: SupabaseClient, id: string): Promise<QuoteRow | null> {
  const { data, error } = await client.from("quotes").select(QUOTE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw quoteError(error);
  return data ? fromDb(data as Record<string, unknown>) : null;
}

/** Naujausi pirmi. Žurnalas auga lėtai (dešimtys per dieną), todėl metų užtenka vienos užklausos. */
export async function listQuotes(client: SupabaseClient, sinceIso: string): Promise<{ rows: QuoteRow[]; available: boolean }> {
  const { data, error } = await client.from("quotes").select(QUOTE_COLUMNS)
    .gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(5000);
  if (isMissingQuotesTable(error)) return { rows: [], available: false };
  if (error) throw quoteError(error);
  return { rows: (data ?? []).map((row) => fromDb(row as Record<string, unknown>)), available: true };
}
