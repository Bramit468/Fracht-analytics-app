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
import { mergeDaily, mergeRawPayloads, mergeSupplyPayloads } from "@/lib/telematics-archive";
import { readArchive, writeArchive, type ArchivedSources } from "@/lib/telematics-archive-store";
import { buildOrderTrips, editedByHand, importChanges, parseOrderLegs, parseOrders, type ImportedTrip, type SkippedOrder, type StoredOrderTrip } from "@/lib/telematics-orders";
import { calculateSavedTrip } from "@/lib/trip-input";
import { fetchAllRows } from "@/lib/trips";
import { truckRowToCalc } from "@/lib/truck";
import type { Truck } from "@/types/truck";

import { geocode, ptvJson, PtvError } from "../new/route-core";

export interface OrderPreview extends ImportedTrip {
  /** Esamas reisas, jei šis užsakymas jau importuotas. */
  existingId: string | null;
  /**
   * Įrašyti apmokami km. Atnaujinant reisą be Telematikos km jie lieka – PTV
   * jau skaičiavo, o kartojant ~150 užklausų baigtųsi PTV dienos limitas.
   */
  storedPaidKm: number | null;
  /** Kas pasikeitė nuo paskutinio importo; tuščias – nieko. `null` – naujas. */
  changes: string[] | null;
  /** Ką ranka pataisė vartotojas; netuščias – reisas neperrašomas. */
  handEdited: string[];
  profitCents: number;
  marginPercent: number | null;
}

export type OrderImportResult =
  | {
    ok: true; trips: OrderPreview[]; skipped: SkippedOrder[]; unassignedTollCents: number; unassignedEmptyKm: number; suspectEmptyKm: number;
    /** Ankstyviausia kelionė, iš kurios skaičiuota (archyvas + srautas). */
    dataFrom: string | null;
    /** Archyvo įspėjimas; `null` – viskas gerai. */
    archiveNote: string | null;
  }
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
      .select("id,telematika_order_id,trip_date,truck_id,days,paid_km,empty_km,freight_price_cents,bridges_cents,ferries_cents,per_diem_cents,import_snapshot")
      .not("telematika_order_id", "is", null).order("id").range(from, to))
      .then((data) => ({ data, error: null }), (error: { code?: string }) => ({ data: null, error })),
    fetchCompanySettings(supabase),
  ]);
  if (existingResult.error?.code === "42703" || existingResult.error?.code === "PGRST204") {
    return { ok: false, message: "Importui reikia migracijos 0021 – paleiskite ją Supabase SQL redaktoriuje." };
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

  const [ordersRaw, tripsRaw, canRaw, suppliesRaw, rates] = feeds;

  // Srautai siekia tik mėnesį, todėl kiekvienas atnaujinimas juos nusirašo į
  // archyvą ir skaičiuoja iš visko, kas sukaupta (2026-11-25): iš srauto
  // iškritę užsakymai perskaičiuojami ta pačia logika, o ne lieka seni.
  let archived: ArchivedSources = { orders: [], trips: [], daily: [], supplies: [] };
  let archiveNote: string | null = null;
  try {
    const saved = await writeArchive(supabase, { canDaily: canRaw, supplies: suppliesRaw, orders: ordersRaw, trips: tripsRaw });
    if (saved.error) archiveNote = `Archyvas neatnaujintas: ${saved.error}`;
    else if (saved.rawMissing) archiveNote = "Užsakymų archyvui reikia migracijos 0028 – skaičiuota tik iš paskutinio mėnesio.";
    archived = await readArchive(supabase);
  } catch (cause) {
    console.error("Telematikos užsakymų importas: archyvas", cause);
    archiveNote = "Archyvo nepavyko perskaityti – skaičiuota tik iš paskutinio mėnesio.";
  }

  let built;
  let dataFrom: string | null = null;
  try {
    const legs = parseOrderLegs(mergeRawPayloads("trips", archived.trips, tripsRaw));
    dataFrom = legs.reduce<string | null>((min, leg) => (min === null || leg.start < min ? leg.start : min), null)?.slice(0, 10) ?? null;
    built = buildOrderTrips({
      orders: parseOrders(mergeRawPayloads("orders", archived.orders, ordersRaw)),
      legs,
      trucks: trucksResult.data as Truck[],
      daily: mergeDaily(archived.daily, parseCanDaily(canRaw)),
      supplies: parseSupplies(mergeSupplyPayloads(archived.supplies, suppliesRaw), (amount, currency, date) => toEuroCents(rates, amount, currency, date)).supplies,
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
  const existing = new Map((existingResult.data ?? []).map((row) => [row.telematika_order_id as string, row as StoredOrderTrip & { id: string; ferries_cents: number | null; import_snapshot: StoredOrderTrip | null }]));

  const trips = built.trips.map((fresh): OrderPreview => {
    const stored = existing.get(fresh.orderId);
    // Seniausias furos užsakymas duomenyse: kas buvo prieš jį, nežinoma, todėl
    // tušti km ir keliai iš dienų be užsakymo – įrašyti. Paros ir data priklauso
    // tik nuo jo paties atkarpų, tad jos perskaičiuojamos.
    let item = fresh;
    if (stored && fresh.feedEdge) {
      const trip = { ...fresh.trip, empty_km: Number(stored.empty_km), bridges_cents: Number(stored.bridges_cents), ferries_cents: Number(stored.ferries_cents ?? fresh.trip.ferries_cents) };
      item = {
        ...fresh,
        trip,
        legs: [{ country: "Nemokami", km: Math.round((Number(trip.paid_km) + trip.empty_km) * 100) / 100 }],
        notes: [...fresh.notes.filter((note) => !note.startsWith("Tušti km +") && !note.startsWith("Keliai ")), "Seniausias furos užsakymas Telematikos duomenyse – tušti km ir keliai palikti įrašyti."],
      };
    }
    // Peržiūrai – dabartiniai furos kaštai; įrašant kopiją padarys duomenų bazė.
    const result = calculateSavedTrip(item.trip, item.legs, truckRowToCalc(trucks.get(item.trip.truck_id)!), tariffs);
    return {
      ...item,
      existingId: stored?.id ?? null,
      storedPaidKm: stored ? Number(stored.paid_km) : null,
      changes: stored ? importChanges(stored, item) : null,
      handEdited: stored ? editedByHand(stored, stored.import_snapshot) : [],
      profitCents: result.profitCents,
      marginPercent: result.marginPercent,
    };
  });

  return { ok: true, trips, skipped: built.skipped, unassignedTollCents: built.unassignedTollCents, unassignedEmptyKm: built.unassignedEmptyKm, suspectEmptyKm: built.suspectEmptyKm, dataFrom, archiveNote };
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
