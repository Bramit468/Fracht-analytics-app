"use server";

import { emptyRunStart, type EmptyRunStart, type TruckGps, type TruckTrip } from "@/lib/empty-run";
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
    /** Tuščio kelio linija žemėlapiui ir jo pradžia (kur fura yra ar bus). */
    line: LineCoordinate[];
    from: { latitude: number; longitude: number };
  }
  | { ok: false; reason: string };

/** Kiek dienų atgal ieškoti reiso, kurio iškrovime fura gali būti. */
const REISU_LANGAS_DIENU = 60;
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
 * Tušti km iki pakrovimo nuo ten, kur fura bus (Phase 0, 3 punktas).
 *
 * Serveryje, nes reikia ir PTV rakto, ir Telematikos nuorodos. Telematika
 * tikrinama kaip kitur – tik savai įmonei; be jos dar lieka nesibaigusio reiso
 * iškrovimas. Nepavykus forma grįžta prie istorijos, todėl klaida čia tik
 * paaiškinama, o ne metama.
 */
export async function emptyRunToLoading(
  truckId: string,
  quoteDateInput: string,
  loading: { address: string; point: string },
  /** Dispečerio įrašyta vieta, kur fura tuo metu bus – nustelbia viską. */
  manualStart: { address: string; point: string } | null = null,
  /** Tarpiniai taškai, nutempti ant raudonos linijos žemėlapyje. */
  viaInput: ViaPoint[] = [],
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
  // Be datos – šiandien: GPS vieta tinka, o forma įspėja, kad ji gali keistis.
  const quoteDate = quoteDateInput || today;
  if (!truckId || !/^\d{4}-\d{2}-\d{2}$/.test(quoteDate)) return { ok: false, reason: "Nėra furos ar datos." };

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { ok: false, reason: "Prisijunkite iš naujo." };

  const [truckResult, tripResult, allowed] = await Promise.all([
    supabase.from("trucks").select("plate").eq("id", truckId).maybeSingle(),
    supabase
      .from("trips")
      .select("trip_number,trip_date,days,destination,stops")
      .eq("truck_id", truckId)
      .lte("trip_date", quoteDate)
      .gte("trip_date", addDays(quoteDate, -REISU_LANGAS_DIENU)),
    canUseTelematics(supabase),
  ]);
  if (!truckResult.data) return { ok: false, reason: "Fura nerasta." };

  const trips: TruckTrip[] = (tripResult.data ?? []).map((row) => ({
    tripNumber: String(row.trip_number ?? ""),
    tripDate: String(row.trip_date),
    days: Number(row.days),
    destination: String(row.destination ?? ""),
    stops: row.stops,
  }));

  // GPS prašoma tik tada, kai jos reikia: įrašyta vieta ar nesibaigęs reisas ją nustelbia.
  let start: EmptyRunStart | null = manualStart && (manualStart.address.trim() || manualStart.point)
    ? { source: "manual", address: manualStart.address.trim(), point: manualStart.point }
    : emptyRunStart(trips, quoteDate, today, null);
  if (!start && allowed) start = emptyRunStart(trips, quoteDate, today, await truckGps(truckResult.data.plate, today));
  if (!start) return { ok: false, reason: "Furos vieta nežinoma." };

  try {
    const from: Pick<GeocodedPlace, "latitude" | "longitude"> | null = start.source === "gps"
      ? start
      : pickedPoint(start.point, start.address) ?? await geocode(start.address, key);
    const to = pickedPoint(loading.point, loading.address) ?? await geocode(loading.address, key);
    if (!from || !to) return { ok: false, reason: "Nepavyko rasti pradžios ar pakrovimo vietos." };

    // Tuščia fura: 0 kg krovinio (PTV kuras tuščiai furai) ir be išvykimo laiko – tipinis eismas.
    const payload = await ptvJson(routeRequestUrl(from, to, false, routeTiming() ?? undefined, { loadWeightKg: 0 }, via), key);
    const estimate = routeEstimate(payload);
    if (!estimate) return { ok: false, reason: "Nepavyko suskaičiuoti kelio iki pakrovimo." };

    return {
      ok: true,
      start,
      km: Math.round(estimate.km * 100) / 100,
      tollCents: estimate.tollCents,
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
