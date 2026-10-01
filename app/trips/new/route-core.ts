import { simplifyRouteLine, parseRouteLine, type LineCoordinate } from "@/lib/route-line";
import {
  firstPlace,
  routeEstimate,
  routeFill,
  routeRequestUrl,
  routeTiming,
  suggestedDays,
  PTV_GEOCODING_URL,
  type GeocodedPlace,
  type RouteFill,
  type RouteViolation,
} from "@/lib/ptv-route";
import { hasWeights, routeEmissions, type RouteEmissions } from "@/lib/ptv-emissions";
import { normalizeAddressQuery } from "@/lib/postal-code";
import type { RouteLookupInput } from "@/lib/route-input";
import type { ViaPoint } from "@/lib/via-points";
import { createServerSupabaseClient } from "@/lib/supabase-server";

/**
 * Maršruto skaičiavimas, kurį kviečia ir route handler'is (su `AbortSignal`,
 * kad pasenusi užklausa nenueitų į PTV), ir server action'ai (variantai,
 * tvarkaraštis). Tai ne „use server“ failas: čia eksportuojamos ne tik funkcijos.
 */

/** Sustojimo vieta, kurią PTV iš tikrųjų panaudojo – žymekliui ir adreso tekstui. */
export interface StopPlace {
  latitude: number;
  longitude: number;
  label: string;
}

export type { RouteLookupInput };

export type RouteLookupResult =
  | {
      ok: true;
      fill: RouteFill;
      km: number;
      travelMinutes: number;
      trafficDelayMinutes: number;
      trafficMode: "REALISTIC" | "AVERAGE";
      tollCents: number;
      bridgesCents: number;
      ferriesCents: number;
      tunnelsCents: number;
      ferryDetected: boolean;
      ferryNames: string[];
      avoidedFerries: boolean;
      days: number;
      /** Ką PTV suprato iš adresų – kad matytųsi, jei suprato ne tai. */
      fromAddress: string;
      toAddress: string;
      /** Visų sustojimų (ne tarpinių taškų) vietos maršruto tvarka. */
      places: StopPlace[];
      /** Bent vienas adresas rastas tik iki miesto, ne iki namo. */
      approximate: boolean;
      /** PTV nerado vilkikui tinkamo kelio arba jis pažeidžia ribojimus. */
      violated: boolean;
      violations: RouteViolation[];
      /** Maršruto linija žemėlapiui, supaprastinta iki ~3 m tikslumo (#74). */
      line: LineCoordinate[];
      /** PTV kuro ir CO2e įvertis pagal maršrutą ir masę (#86). */
      emissions: RouteEmissions | null;
      /** Ar buvo perduoti svoriai — nuo to priklauso įverčio tikslumas. */
      weightsUsed: boolean;
    }
  | { ok: false; message: string };

/** PTV atsakymo klaida su kodu — kad žinutė galėtų pasakyti, kas negerai. */
export class PtvError extends Error {
  constructor(readonly status: number, readonly body: string) {
    super(`PTV ${status}`);
  }
}

export async function ptvJson(url: string, key: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { headers: { apiKey: key }, cache: "no-store", signal });
  if (!response.ok) {
    // Kūnas nuskaitomas iki galo: PTV jame paaiškina, kas negerai, o be to
    // liktų tik „nepavyko", ir kita klaida vėl būtų aklas spėjimas.
    throw new PtvError(response.status, (await response.text()).slice(0, 500));
  }
  return response.json();
}

export async function geocodePayload(query: string, key: string, signal?: AbortSignal) {
  const url = `${PTV_GEOCODING_URL}?searchText=${encodeURIComponent(normalizeAddressQuery(query))}&language=lt`;
  return ptvJson(url, key, signal);
}

/**
 * Tas pats adreso tekstas kartojasi kiekvieną kartą, kai tempiamas maršruto
 * taškas: pradžia ir pabaiga be pasirinkto pasiūlymo geokoduojamos iš naujo.
 * Atmintyje laikomas atsakymas sutaupo PTV užklausą (~0,2 s) kiekvienam tempimui.
 */
const GEOCODE_TTL_MS = 10 * 60 * 1000;
const GEOCODE_LIMIT = 200;
const geocodeCache = new Map<string, { at: number; place: GeocodedPlace }>();

export async function geocode(query: string, key: string, signal?: AbortSignal) {
  const cacheKey = query.trim().toLowerCase();
  const hit = geocodeCache.get(cacheKey);
  if (hit && Date.now() - hit.at < GEOCODE_TTL_MS) return hit.place;

  const place = firstPlace(await geocodePayload(query, key, signal));
  // Nerasti adresai neįrašomi: kitas bandymas gali pavykti.
  if (place) {
    geocodeCache.set(cacheKey, { at: Date.now(), place });
    if (geocodeCache.size > GEOCODE_LIMIT) geocodeCache.delete(geocodeCache.keys().next().value as string);
  }
  return place;
}

/** „55.7,24.3“ iš paslėpto lauko. Netinkamas tekstas verčia geokoduoti iš naujo. */
export function pickedPoint(value: string | undefined, label: string): GeocodedPlace | null {
  const parts = (value ?? "").split(",");
  if (parts.length !== 2) return null;
  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude, formattedAddress: label, locationType: "PICKED" };
}

/**
 * Sustojimai ir tarpiniai taškai -> vilkiko maršrutas -> kilometrai ir kelių
 * mokesčiai (#61).
 *
 * Užklausa eina iš serverio, nes `PTV_API_KEY` į naršyklę patekti negali.
 * Prisijungimas tikrinamas ir čia: handler'is pasiekiamas adresu, ne tik per
 * mygtuką. `signal` nutraukia PTV užklausas, kai naršyklė atsisako pasenusios.
 */
export async function runRouteLookup(
  input: RouteLookupInput,
  signal?: AbortSignal,
): Promise<RouteLookupResult> {
  // Įklijuojant į Vercel lengvai prilimpa tarpas ar eilutės pabaiga, o PTV
  // tada atmeta raktą kaip neteisingą.
  const key = process.env.PTV_API_KEY?.trim();
  if (!key) {
    return { ok: false, message: "Maršrutų skaičiavimas neįjungtas." };
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return { ok: false, message: "Prisijunkite iš naujo." };
  }

  const first = input.waypoints[0];
  const last = input.waypoints[input.waypoints.length - 1];
  if (first.kind !== "stop" || last.kind !== "stop" || !first.address.trim() || !last.address.trim()) {
    return { ok: false, message: "Užpildykite laukus „Iš“ ir „Į“." };
  }

  const timing = routeTiming(input.departureAt);
  if (!timing) {
    return { ok: false, message: "Neteisinga išvykimo data arba laikas." };
  }

  try {
    // Pasirinktas variantas naudojamas kaip yra: tada tiksliai žinoma, kurį
    // tašką žmogus turėjo omenyje, ir spėlioti nebereikia (#65).
    const resolved = await Promise.all(
      input.waypoints.map(async (waypoint) => {
        if (waypoint.kind === "via") {
          return { kind: "via" as const, place: { ...waypoint, formattedAddress: "", locationType: "VIA" } };
        }
        const place = pickedPoint(waypoint.point, waypoint.address) ?? await geocode(waypoint.address, key, signal);
        return { kind: "stop" as const, place, address: waypoint.address };
      }),
    );

    const missing = resolved.find((row) => row.kind === "stop" && !row.place);
    if (missing && missing.kind === "stop") {
      return { ok: false, message: `Nepavyko rasti adreso „${missing.address}“.` };
    }

    const points = resolved.map((row) => row.place as GeocodedPlace);
    const from = points[0];
    const to = points[points.length - 1];
    const via: ViaPoint[] = points.slice(1, -1);
    const stopPlaces = resolved.flatMap((row) => (row.kind === "stop" ? [row.place as GeocodedPlace] : []));

    const url = routeRequestUrl(from, to, input.avoidFerries, timing, input.weights, via);

    // Kur PTV pastatė taškus: be to, nepavykus maršrutui, lieka spėlioti,
    // ar kaltas adreso tekstas, ar vieta, į kurią jis buvo suprastas.
    console.info(
      "PTV maršrutas",
      `${from.formattedAddress} [${from.latitude},${from.longitude}] ->`,
      `${to.formattedAddress} [${to.latitude},${to.longitude}]`,
      via.length > 0 ? `(+${via.length} tarp.)` : "",
    );

    const payload = await ptvJson(url, key, signal);
    const estimate = routeEstimate(payload);
    if (!estimate) {
      return { ok: false, message: "Nepavyko suskaičiuoti maršruto." };
    }

    // Supaprastinimas serveryje: pilna Panevėžys–Oslas yra apie 418 KB. Taškai
    // išmetami tik ten, kur tiesė nenukrypsta nuo kelio daugiau nei per kelis metrus.
    const line = simplifyRouteLine(parseRouteLine((payload as { polyline?: unknown }).polyline));

    return {
      ok: true,
      fill: routeFill(estimate),
      km: estimate.km,
      travelMinutes: estimate.travelMinutes,
      trafficDelayMinutes: estimate.trafficDelayMinutes,
      trafficMode: timing.trafficMode,
      tollCents: estimate.tollCents,
      bridgesCents: estimate.bridgesCents,
      ferriesCents: estimate.ferriesCents,
      tunnelsCents: estimate.tunnelsCents,
      ferryDetected: estimate.ferryDetected,
      ferryNames: estimate.ferryNames,
      avoidedFerries: input.avoidFerries,
      days: suggestedDays(estimate.travelHours),
      fromAddress: from.formattedAddress,
      toAddress: to.formattedAddress,
      places: stopPlaces.map((place, index) => ({
        latitude: place.latitude,
        longitude: place.longitude,
        label: place.formattedAddress || (index === 0 ? from.formattedAddress : ""),
      })),
      // Pasirinktas variantas laikomas tiksliu: žmogus jį matė ir patvirtino.
      approximate: stopPlaces.some(
        (place) => place.locationType !== "EXACT_ADDRESS" && place.locationType !== "PICKED",
      ),
      violated: estimate.violated,
      violations: estimate.violations,
      line,
      emissions: routeEmissions(payload, estimate.km),
      weightsUsed: hasWeights(input.weights),
    };
  } catch (cause) {
    // Nutraukimas yra įprastas reikalas tempiant, o ne gedimas: iškviečiantysis
    // jau laukia naujesnio atsakymo.
    if (signal?.aborted) throw cause;

    if (cause instanceof PtvError) {
      console.error("PTV atmetė užklausą", cause.status, cause.body);

      if (cause.status === 401 || cause.status === 403) {
        return {
          ok: false,
          message: "Maršrutų paslauga nepriėmė rakto. Patikrinkite PTV_API_KEY reikšmę Vercel’yje – dažniausiai įsivelia tarpas arba eilutės pabaiga.",
        };
      }
      if (cause.body.includes("ROUTING_ROUTE_NOT_FOUND")) {
        return {
          ok: false,
          message:
            "PTV nerado vilkikui tinkamo kelio tarp nurodytų taškų. "
            + "Dažniausia priežastis – tikslus namo taškas gatvėje, kuri uždara sunkiasvorėms, "
            + "arba tempiamas taškas ant uždaro kelio. Pabandykite nurodyti miestą arba artimiausią didesnę gatvę.",
        };
      }
      if (cause.status === 429) {
        return { ok: false, message: "Viršytas maršrutų užklausų limitas. Bandykite vėliau." };
      }
      return { ok: false, message: `Maršrutų paslauga grąžino klaidą ${cause.status}.` };
    }

    console.error("Nepavyko pasiekti PTV", cause);
    return { ok: false, message: "Nepavyko susisiekti su maršrutų paslauga." };
  }
}
