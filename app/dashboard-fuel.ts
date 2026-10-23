"use server";

import { costInsights, type Insight } from "@/lib/cost-insights";
import { fetchEcbRates, toEuroCents } from "@/lib/ecb-rates";
import { fuelPricesByCountry, type FuelPriceRow } from "@/lib/fuel-prices";
import { actualsOverSpans, isCovered, telematicsCoverage, type Coverage, type SpanActuals, type TripSpan } from "@/lib/plan-actual";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { canUseTelematics } from "@/lib/telematics-access";
import { actualsByTruck, parseCanDaily, parseSupplies, type ActualCosts } from "@/lib/telematics-costs";
import { fetchTelematics, TelematicsFeedError } from "@/lib/telematics-feed";

export type FuelReport =
  | { ok: true; trucks: ActualCosts[]; byCountry: FuelPriceRow[]; insights: Insight[] }
  | { ok: false; message: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Suvestinės skirtukas „Kuras“: tas pats, ką rodo /telematika, tik suvestinės
 * laikotarpiui. Serveryje, nes Telematikos nuorodose yra prieigos raktas.
 */
export async function loadFuelReport(from: string, to: string): Promise<FuelReport> {
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) return { ok: false, message: "Neteisingas laikotarpis." };

  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { ok: false, message: "Prisijunkite iš naujo." };
  if (!(await canUseTelematics(supabase))) return { ok: false, message: "Telematika šiai įmonei neprijungta." };

  try {
    const [canRaw, suppliesRaw, rates] = await Promise.all([
      fetchTelematics("canDaily"),
      fetchTelematics("supplies"),
      fetchEcbRates(),
    ]);
    const { supplies } = parseSupplies(suppliesRaw, (amount, currency, date) => toEuroCents(rates, amount, currency, date));
    const trucks = actualsByTruck(parseCanDaily(canRaw), supplies, from, to);
    const byCountry = fuelPricesByCountry(supplies.filter((supply) => supply.date >= from && supply.date <= to));
    return { ok: true, trucks, byCountry, insights: costInsights(trucks, byCountry) };
  } catch (cause) {
    console.error("Suvestinės kuras", cause instanceof TelematicsFeedError ? cause.message : cause);
    return { ok: false, message: "Nepavyko gauti Telematikos duomenų. Bandykite vėliau." };
  }
}

export type PlanActualReport =
  | { ok: true; coverage: Coverage | null; actuals: SpanActuals[] }
  | { ok: false; message: string };

const MAX_SPANS = 20_000;

function validSpan(span: unknown): span is TripSpan {
  if (typeof span !== "object" || span === null) return false;
  const { plate, from, to } = span as Record<string, unknown>;
  return typeof plate === "string" && plate.length <= 32
    && typeof from === "string" && ISO_DATE.test(from)
    && typeof to === "string" && ISO_DATE.test(to)
    && from <= to;
}

/**
 * Skirtukas „Planas ir faktas“: faktiniai furų kaštai reisų dienomis.
 * Reisų dienas siunčia naršyklė – jos jau turi suvestinės filtrus; čia jos
 * tik patikrinamos, o Telematikos duomenys lieka serveryje.
 */
export async function loadPlanActuals(spans: unknown): Promise<PlanActualReport> {
  if (!Array.isArray(spans) || spans.length > MAX_SPANS) return { ok: false, message: "Per daug reisų palyginimui – susiaurinkite laikotarpį." };
  const valid = spans.filter(validSpan);

  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { ok: false, message: "Prisijunkite iš naujo." };
  if (!(await canUseTelematics(supabase))) return { ok: false, message: "Telematika šiai įmonei neprijungta." };

  try {
    const [canRaw, suppliesRaw, rates] = await Promise.all([
      fetchTelematics("canDaily"),
      fetchTelematics("supplies"),
      fetchEcbRates(),
    ]);
    const daily = parseCanDaily(canRaw);
    const { supplies } = parseSupplies(suppliesRaw, (amount, currency, date) => toEuroCents(rates, amount, currency, date));
    const coverage = telematicsCoverage(daily);
    if (!coverage) return { ok: true, coverage, actuals: [] };
    return { ok: true, coverage, actuals: actualsOverSpans(daily, supplies, valid.filter((span) => isCovered(span, coverage))) };
  } catch (cause) {
    console.error("Suvestinės planas ir faktas", cause instanceof TelematicsFeedError ? cause.message : cause);
    return { ok: false, message: "Nepavyko gauti Telematikos duomenų. Bandykite vėliau." };
  }
}
