"use server";

import { unstable_cache } from "next/cache";

import type { CountryTariff, RateType } from "@/lib/calc";
import { ptvQuotaExceeded, PTV_QUOTA_MESSAGE, routeEstimate, routeRequestUrl, type GeocodedPlace } from "@/lib/ptv-route";
import { fetchEcbRates, toEuroCents } from "@/lib/ecb-rates";
import { fetchCompanySettings } from "@/lib/company-settings";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { canUseTelematics } from "@/lib/telematics-access";
import { parseCanDaily, parseSupplies } from "@/lib/telematics-costs";
import { fetchTelematics, TelematicsFeedError } from "@/lib/telematics-feed";
import { buildOrderTrips, importChanges, parseOrderLegs, parseOrders, type ImportedTrip, type SkippedOrder, type StoredOrderTrip } from "@/lib/telematics-orders";
import { calculateSavedTrip } from "@/lib/trip-input";
import { fetchAllRows } from "@/lib/trips";
import { truckRowToCalc } from "@/lib/truck";
import type { Truck } from "@/types/truck";

import { geocode, ptvJson, PtvError } from "../new/route-core";

export interface OrderPreview extends ImportedTrip {
  /** Esamas reisas, jei šis užsakymas jau importuotas. */
  existingId: string | null;
  /** Kas pasikeitė nuo paskutinio importo; tuščias – nieko. `null` – naujas. */
  changes: string[] | null;
  profitCents: number;
  marginPercent: number | null;
}

export type OrderImportResult =
  | { ok: true; trips: OrderPreview[]; skipped: SkippedOrder[]; unassignedTollCents: number }
  | { ok: false; message: string };

/** Dabartinis laikas taip, kaip jį rašo Telematika: vietinis, be zonos. */
function vilniusNow(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Vilnius",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(new Date());
}

/**
 * Telematikos užsakymai, paversti reisais, su žyma, kurie nauji ar pakitę.
 *
 * Serveryje, nes nuorodose yra prieigos raktas. Įrašo naršyklė per tą patį
 * `save_trip_with_legs`, kaip ir Excel importas: taip veikia RLS ir kaštų kopija.
 */
export async function loadTelematikaOrders(): Promise<OrderImportResult> {
  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { ok: false, message: "Prisijunkite iš naujo." };
  if (!(await canUseTelematics(supabase))) return { ok: false, message: "Telematika šiai įmonei neprijungta." };

  const [trucksResult, tariffsResult, existingResult, settings] = await Promise.all([
    supabase.from("trucks").select("*"),
    supabase.from("country_tariffs").select("country,rate,rate_type"),
    // Daugiau nei 1000 importuotų reisų be puslapiavimo virstų dublikatais.
    fetchAllRows((from, to) => supabase.from("trips")
      .select("id,telematika_order_id,trip_date,truck_id,days,paid_km,empty_km,freight_price_cents,bridges_cents,per_diem_cents")
      .not("telematika_order_id", "is", null).order("id").range(from, to))
      .then((data) => ({ data, error: null }), (error: { code?: string }) => ({ data: null, error })),
    fetchCompanySettings(supabase),
  ]);
  if (existingResult.error?.code === "42703" || existingResult.error?.code === "PGRST204") {
    return { ok: false, message: "Importui reikia migracijos 0019 – paleiskite ją Supabase SQL redaktoriuje." };
  }
  if (trucksResult.error || tariffsResult.error || existingResult.error) {
    return { ok: false, message: "Nepavyko nuskaityti furų ar reisų. Bandykite dar kartą." };
  }

  let feeds;
  try {
    feeds = await Promise.all([
      fetchTelematics("orders"),
      fetchTelematics("trips"),
      fetchTelematics("canDaily"),
      fetchTelematics("supplies"),
      fetchEcbRates(),
    ]);
  } catch (cause) {
    console.error("Telematikos užsakymų importas: srautai", cause instanceof TelematicsFeedError ? cause.message : cause);
    return {
      ok: false,
      message: cause instanceof TelematicsFeedError
        ? `Nepavyko gauti duomenų iš Telematikos – ${cause.message}.`
        : "Nepavyko gauti duomenų iš Telematikos arba ECB kursų. Bandykite po kelių minučių.",
    };
  }

  let built;
  try {
    const [ordersRaw, tripsRaw, canRaw, suppliesRaw, rates] = feeds;
    built = buildOrderTrips({
      orders: parseOrders(ordersRaw),
      legs: parseOrderLegs(tripsRaw),
      trucks: trucksResult.data as Truck[],
      daily: parseCanDaily(canRaw),
      supplies: parseSupplies(suppliesRaw, (amount, currency, date) => toEuroCents(rates, amount, currency, date)).supplies,
      now: vilniusNow(),
      perDiemPercent: settings.perDiemPercent,
    });
  } catch (cause) {
    console.error("Telematikos užsakymų importas: apdorojimas", cause);
    return { ok: false, message: `Telematikos duomenys gauti, bet jų nepavyko apdoroti: ${cause instanceof Error ? cause.message : "nežinoma klaida"}.` };
  }

  const trucks = new Map((trucksResult.data as Truck[]).map((truck) => [truck.id, truck]));
  const tariffs: CountryTariff[] = (tariffsResult.data ?? []).map((row) => ({
    country: row.country as string,
    rate: Number(row.rate),
    rateType: row.rate_type as RateType,
  }));
  const existing = new Map((existingResult.data ?? []).map((row) => [row.telematika_order_id as string, row as StoredOrderTrip & { id: string }]));

  const trips = built.trips.map((item): OrderPreview => {
    // Peržiūrai – dabartiniai furos kaštai; įrašant kopiją padarys duomenų bazė.
    const result = calculateSavedTrip(item.trip, item.legs, truckRowToCalc(trucks.get(item.trip.truck_id)!), tariffs);
    const stored = existing.get(item.orderId);
    return {
      ...item,
      existingId: stored?.id ?? null,
      changes: stored ? importChanges(stored, item) : null,
      profitCents: result.profitCents,
      marginPercent: result.marginPercent,
    };
  });

  return { ok: true, trips, skipped: built.skipped, unassignedTollCents: built.unassignedTollCents };
}

export type PtvKmResult = { ok: true; km: number } | { ok: false; message: string; quota?: boolean };

const PTV_KM_TTL = 30 * 24 * 60 * 60;

/**
 * Tie patys adresai – tas pats atstumas: PTV klausiama vieną kartą per 30 d.
 * Raktas imamas viduje, ne argumentu – argumentai tampa talpyklos raktu.
 */
const cachedRouteKm = unstable_cache(
  async (addresses: string[]): Promise<number> => {
    const key = process.env.PTV_API_KEY?.trim() ?? "";
    const points: GeocodedPlace[] = [];
    for (const address of addresses) {
      const place = await geocode(address, key);
      if (!place) throw new Error(`Nerastas adresas „${address}“.`);
      points.push(place);
    }
    const estimate = routeEstimate(await ptvJson(routeRequestUrl(points[0], points[points.length - 1], false, { trafficMode: "AVERAGE" }, undefined, points.slice(1, -1)), key));
    if (!estimate) throw new Error("PTV negrąžino maršruto.");
    return estimate.km;
  },
  ["ptv-import-km"],
  { revalidate: PTV_KM_TTL },
);

/**
 * Apmokami km užsakymui, kurio atkarpos Telematikoje be km: PTV maršrutas
 * per pakrovimo ir iškrovimo adresus. Kviečiama importuojant, po vieną.
 */
export async function ptvRouteKm(addresses: string[]): Promise<PtvKmResult> {
  const key = process.env.PTV_API_KEY?.trim();
  if (!key) return { ok: false, message: "PTV neįjungtas." };
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { ok: false, message: "Prisijunkite iš naujo." };
  if (!Array.isArray(addresses) || addresses.length < 2 || addresses.length > 10
    || addresses.some((address) => typeof address !== "string" || address.trim() === "" || address.length > 300)) {
    return { ok: false, message: "Netinkami adresai." };
  }

  try {
    return { ok: true, km: await cachedRouteKm(addresses) };
  } catch (cause) {
    if (cause instanceof PtvError && ptvQuotaExceeded(cause.status, cause.body)) {
      return { ok: false, message: PTV_QUOTA_MESSAGE, quota: true };
    }
    return { ok: false, message: cause instanceof Error && cause.message.startsWith("Nerastas") ? cause.message : "PTV maršruto apskaičiuoti nepavyko." };
  }
}
