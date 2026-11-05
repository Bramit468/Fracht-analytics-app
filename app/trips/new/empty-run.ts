"use server";

import { emptyRunStart, type EmptyRunStart, type TruckGps } from "@/lib/empty-run";
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

/**
 * Tušti km iki pakrovimo (Phase 0, 3 punktas): nuo įrašytos vietos, o jos
 * nesant – nuo dabartinės furos GPS vietos. Kitų šaltinių nėra (2026-11-05).
 *
 * Serveryje, nes reikia ir PTV rakto, ir Telematikos nuorodos. Telematika
 * tikrinama kaip kitur – tik savai įmonei. Nepavykus klaida tik paaiškinama,
 * o ne metama.
 */
export async function emptyRunToLoading(
  truckId: string,
  quoteDateInput: string,
  loading: { address: string; point: string },
  /** Dispečerio įrašyta vieta, kur fura tuo metu bus. */
  manualStart: { address: string; point: string } | null = null,
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
  // Data čia nebereikalinga (pradžia nuo jos nepriklauso), bet tikrinama, kad būtų tvarkinga.
  const quoteDate = quoteDateInput || today;
  if (!truckId || !/^\d{4}-\d{2}-\d{2}$/.test(quoteDate)) return { ok: false, reason: "Nėra furos ar datos." };

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { ok: false, reason: "Prisijunkite iš naujo." };

  const [truckResult, allowed] = await Promise.all([
    supabase.from("trucks").select("plate").eq("id", truckId).maybeSingle(),
    canUseTelematics(supabase),
  ]);
  if (!truckResult.data) return { ok: false, reason: "Fura nerasta." };

  // GPS prašoma tik tada, kai vieta neįrašyta.
  const manual = manualStart && (manualStart.address.trim() || manualStart.point) ? manualStart : null;
  const gps = !manual && allowed ? await truckGps(truckResult.data.plate, today) : null;
  const start = emptyRunStart(manual, gps);
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
