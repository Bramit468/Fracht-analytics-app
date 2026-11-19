"use server";

import { emptyRunStart, plannedUnloading, type EmptyRunStart, type TruckGps } from "@/lib/empty-run";
import { plateKey } from "@/lib/telematics-costs";
import { parseOrderLegs, placeCity, placeQuery } from "@/lib/telematics-orders";
import { todayInVilnius } from "@/lib/local-date";
import { routeEmissions } from "@/lib/ptv-emissions";
import { routeEstimate, routeRequestUrl, routeTiming, type GeocodedPlace } from "@/lib/ptv-route";
import { parseRouteLine, simplifyRouteLine, type LineCoordinate } from "@/lib/route-line";
import { MAX_VIA_POINTS, type ViaPoint } from "@/lib/via-points";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { liveTrucks, parseSnapshots } from "@/lib/telematics";
import { canUseTelematics } from "@/lib/telematics-access";
import { fetchTelematics } from "@/lib/telematics-feed";
import { addDays } from "@/lib/trip-progress";

import { geocode, pickedPoint, ptvJson } from "./route-core";

export type EmptyRunResult =
  | {
    ok: true;
    start: EmptyRunStart;
    km: number;
    tollCents: number;
    travelMinutes: number;
    /** PTV kuras tuščiai furai (0 kg), l/100. */
    fuelL100: number | null;
    /** Keltai tuščiame kelyje ir PTV jų kaina (dažniausiai 0 – nežinoma). `tollCents` jos neturi. */
    ferryNames: string[];
    ferriesCents: number;
    /** Tuščio kelio linija žemėlapiui ir jo pradžia (kur fura yra ar bus). */
    line: LineCoordinate[];
    from: { latitude: number; longitude: number };
  }
  | { ok: false; reason: string };

/** Senesnė GPS vieta – parduota ar išjungta fura, ne jos buvimo vieta. */
const VIETA_GALIOJA_DIENU = 7;

/** Dabartis tiekėjo formatu ir zona – kaip „Vyksta dabar“ puslapyje. */
function vilniusNow(date: Date): string {
  return date.toLocaleString("sv-SE", { timeZone: "Europe/Vilnius" });
}

async function truckGps(plate: string, today: string): Promise<TruckGps | null> {
  if (!process.env.TELEMATIKA_SNAPSHOT_URL) return null;
  try {
    const rows = parseSnapshots(await fetchTelematics("snapshot"), `${addDays(today, -VIETA_GALIOJA_DIENU)} 00:00:00`);
    const truck = liveTrucks(rows, [plate], vilniusNow(new Date())).trucks[0];
    return truck ? { latitude: truck.latitude, longitude: truck.longitude, gpsTime: truck.gpsTime } : null;
  } catch (cause) {
    console.error("Furos vieta tuštiems km", cause);
    return null;
  }
}

/** Telematikoje suplanuotas, dar neįvykęs furos iškrovimas – kur ji bus laisva. */
async function truckPlannedUnloading(plate: string, quoteDate: string): Promise<Extract<EmptyRunStart, { source: "order" }> | null> {
  if (!process.env.TELEMATIKA_TRIPS_URL) return null;
  try {
    const leg = plannedUnloading(parseOrderLegs(await fetchTelematics("trips")), plateKey, plate, vilniusNow(new Date()), quoteDate);
    return leg ? { source: "order", address: placeQuery(leg.endPlace), point: "", city: placeCity(leg.endPlace), end: leg.end } : null;
  } catch (cause) {
    console.error("Suplanuoti iškrovimai tuštiems km", cause);
    return null;
  }
}

/**
 * Tušti km iki pakrovimo (Phase 0, 3 punktas): nuo Telematikoje suplanuoto
 * iškrovimo, o jo nesant – nuo GPS vietos (2026-11-19).
 *
 * Serveryje, nes reikia ir PTV rakto, ir Telematikos nuorodos. Telematika
 * tikrinama kaip kitur – tik savai įmonei. Nepavykus klaida tik paaiškinama,
 * o ne metama.
 */
export async function emptyRunToLoading(
  truckId: string,
  quoteDateInput: string,
  loading: { address: string; point: string },
  /** Tarpiniai taškai, nutempti ant raudonos linijos žemėlapyje. */
  viaInput: ViaPoint[] = [],
  /** „Vengti keltų“ – galioja ir tuščiam keliui. */
  avoidFerries = false,
): Promise<EmptyRunResult> {
  // Iš kliento – tikrinama: tik skaičiai, tik žemėje, ne daugiau nei leidžia forma.
  const via = Array.isArray(viaInput)
    ? viaInput
      .filter((point) => Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude)
        && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180)
      .slice(0, MAX_VIA_POINTS)
      .map((point) => ({ latitude: point.latitude, longitude: point.longitude }))
    : [];
  const key = process.env.PTV_API_KEY?.trim();
  if (!key) return { ok: false, reason: "Maršrutų skaičiavimas neįjungtas." };
  const today = todayInVilnius();
  // Data riboja suplanuotą iškrovimą; be jos – paskutinis suplanuotas.
  const quoteDate = quoteDateInput || "";
  if (!truckId || (quoteDate && !/^\d{4}-\d{2}-\d{2}$/.test(quoteDate))) return { ok: false, reason: "Nėra furos ar datos." };

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { ok: false, reason: "Prisijunkite iš naujo." };

  const [truckResult, allowed] = await Promise.all([
    supabase.from("trucks").select("plate").eq("id", truckId).maybeSingle(),
    canUseTelematics(supabase),
  ]);
  if (!truckResult.data) return { ok: false, reason: "Fura nerasta." };

  // GPS prašoma tik tada, kai suplanuoto iškrovimo nėra.
  const order = allowed ? await truckPlannedUnloading(truckResult.data.plate, quoteDate) : null;
  const gps = !order && allowed ? await truckGps(truckResult.data.plate, today) : null;
  const start = emptyRunStart(order, gps);
  if (!start) return { ok: false, reason: "Furos vieta nežinoma." };

  try {
    const from: Pick<GeocodedPlace, "latitude" | "longitude"> | null = start.source === "gps"
      ? start
      : pickedPoint(start.point, start.address) ?? await geocode(start.address, key);
    const to = pickedPoint(loading.point, loading.address) ?? await geocode(loading.address, key);
    if (!from || !to) return { ok: false, reason: "Nepavyko rasti pradžios ar pakrovimo vietos." };

    // Tuščia fura: 0 kg krovinio (PTV kuras tuščiai furai) ir be išvykimo laiko – tipinis eismas.
    const payload = await ptvJson(routeRequestUrl(from, to, avoidFerries === true, routeTiming() ?? undefined, { loadWeightKg: 0 }, via), key);
    const estimate = routeEstimate(payload);
    if (!estimate) return { ok: false, reason: "Nepavyko suskaičiuoti kelio iki pakrovimo." };

    return {
      ok: true,
      start,
      km: Math.round(estimate.km * 100) / 100,
      // Kelto kaina – atskirai (`ferriesCents`), kad forma ją įrašytų į „Keltai“, ne į kelius.
      tollCents: Math.max(0, estimate.tollCents - estimate.ferriesCents),
      ferryNames: estimate.ferryDetected ? (estimate.ferryNames.length > 0 ? estimate.ferryNames : ["be pavadinimo"]) : [],
      ferriesCents: estimate.ferriesCents,
      travelMinutes: estimate.travelMinutes,
      fuelL100: routeEmissions(payload, estimate.km)?.litresPer100Km ?? null,
      line: simplifyRouteLine(parseRouteLine((payload as { polyline?: unknown }).polyline)),
      from: { latitude: from.latitude, longitude: from.longitude },
    };
  } catch (cause) {
    console.error("Tušti km iki pakrovimo", cause);
    return { ok: false, reason: "Nepavyko suskaičiuoti kelio iki pakrovimo." };
  }
}
