"use server";

import { parseRouteLine, thinRouteLine, type LineCoordinate } from "@/lib/route-line";
import {
  parseNominatim,
  NOMINATIM_URL,
  NOMINATIM_USER_AGENT,
  type FoundAddress,
} from "@/lib/nominatim";
import {
  firstPlace,
  routeEstimate,
  routeFill,
  routeRequestUrl,
  routeTiming,
  suggestedDays,
  PTV_GEOCODING_URL,
  PTV_ROUTING_URL,
  PTV_TRUCK_PROFILE,
  type GeocodedPlace,
  type RouteViolation,
  type RouteFill,
} from "@/lib/ptv-route";
import {
  hasWeights,
  routeEmissions,
  type RouteEmissions,
  type VehicleWeights,
} from "@/lib/ptv-emissions";
import {
  routeSchedule,
  scheduleRequestBody,
  PTV_SCHEDULE_RESULTS,
  type DriverScenario,
  type RouteSchedule,
} from "@/lib/ptv-schedule";
import { createServerSupabaseClient } from "@/lib/supabase-server";

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
      /** Bent vienas adresas rastas tik iki miesto, ne iki namo. */
      approximate: boolean;
      /** PTV nerado vilkikui tinkamo kelio arba jis pažeidžia ribojimus. */
      violated: boolean;
      violations: RouteViolation[];
      /** Maršruto linija žemėlapiui, jau praretinta (#74). */
      line: LineCoordinate[];
      /** PTV kuro ir CO2e įvertis pagal maršrutą ir masę (#86). */
      emissions: RouteEmissions | null;
      /** Ar buvo perduoti svoriai — nuo to priklauso įverčio tikslumas. */
      weightsUsed: boolean;
    }
  | { ok: false; message: string };

/** PTV atsakymo klaida su kodu — kad žinutė galėtų pasakyti, kas negerai. */
class PtvError extends Error {
  constructor(readonly status: number, readonly body: string) {
    super(`PTV ${status}`);
  }
}

async function ptvJson(url: string, key: string): Promise<unknown> {
  const response = await fetch(url, { headers: { apiKey: key }, cache: "no-store" });
  if (!response.ok) {
    // Kūnas nuskaitomas iki galo: PTV jame paaiškina, kas negerai, o be to
    // liktų tik „nepavyko", ir kita klaida vėl būtų aklas spėjimas.
    throw new PtvError(response.status, (await response.text()).slice(0, 500));
  }
  return response.json();
}

async function geocodePayload(query: string, key: string) {
  const url = `${PTV_GEOCODING_URL}?searchText=${encodeURIComponent(query)}`;
  return ptvJson(url, key);
}

async function geocode(query: string, key: string) {
  return firstPlace(await geocodePayload(query, key));
}

/** Trumpiausia užklausa, kuriai apskritai verta kreiptis į paiešką. */
const MIN_PAIESKA = 3;

/**
 * Adreso paieška lietuviškai (#73).
 *
 * Eina per serverį, nes Nominatim reikalauja atpažįstamo `User-Agent`, o
 * naršyklė jo nustatyti neleidžia. Ir jų taisyklės neleidžia siųsti užklausos
 * po kiekvieno klavišo — todėl paieška vyksta paspaudus mygtuką.
 *
 * Tuščias sąrašas grąžinamas tyliai: paieška yra pagalba, ne veiksmas.
 */
export async function searchAddress(query: string): Promise<FoundAddress[]> {
  if (query.trim().length < MIN_PAIESKA) return [];

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return [];

  try {
    const url =
      `${NOMINATIM_URL}?q=${encodeURIComponent(query)}` +
      "&format=json&limit=8&accept-language=lt";

    const response = await fetch(url, {
      headers: { "User-Agent": NOMINATIM_USER_AGENT },
      cache: "no-store",
    });
    if (!response.ok) return [];

    return parseNominatim(await response.json());
  } catch {
    return [];
  }
}

/**
 * Adresai -> vilkiko maršrutas -> kilometrai ir kelių mokesčiai (#61).
 *
 * Užklausa eina iš serverio, nes `PTV_API_KEY` į naršyklę patekti negali.
 * Prisijungimas tikrinamas ir čia: server action pasiekiama adresu, ne tik
 * per mygtuką.
 */
/** „55.7,24.3" iš paslėpto lauko. Netinkamas tekstas verčia geokoduoti iš naujo. */
function pickedPoint(value: string | undefined, label: string): GeocodedPlace | null {
  const parts = (value ?? "").split(",");
  if (parts.length !== 2) return null;
  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude, formattedAddress: label, locationType: "PICKED" };
}

export async function lookupRoute(
  origin: string,
  destination: string,
  fromPoint?: string,
  toPoint?: string,
  avoidFerries = false,
  departureAt?: string,
  weights: VehicleWeights = {},
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

  if (!origin.trim() || !destination.trim()) {
    return { ok: false, message: "Užpildykite laukus „Iš“ ir „Į“." };
  }

  const timing = routeTiming(departureAt);
  if (!timing) {
    return { ok: false, message: "Neteisinga išvykimo data arba laikas." };
  }

  try {
    // Pasirinktas variantas naudojamas kaip yra: tada tiksliai žinoma, kurį
    // tašką žmogus turėjo omenyje, ir spėlioti nebereikia (#65).
    const [from, to] = await Promise.all([
      pickedPoint(fromPoint, origin) ?? geocode(origin, key),
      pickedPoint(toPoint, destination) ?? geocode(destination, key),
    ]);

    if (!from) return { ok: false, message: `Nepavyko rasti adreso „${origin}“.` };
    if (!to) return { ok: false, message: `Nepavyko rasti adreso „${destination}“.` };

    const url = routeRequestUrl(from, to, avoidFerries, timing, weights);

    // Kur PTV pastatė taškus: be to, nepavykus maršrutui, lieka spėlioti,
    // ar kaltas adreso tekstas, ar vieta, į kurią jis buvo suprastas.
    console.info(
      "PTV maršrutas",
      `${from.formattedAddress} [${from.latitude},${from.longitude}] ->`,
      `${to.formattedAddress} [${to.latitude},${to.longitude}]`,
    );

    const payload = await ptvJson(url, key);
    const estimate = routeEstimate(payload);
    if (!estimate) {
      return { ok: false, message: "Nepavyko suskaičiuoti maršruto." };
    }

    // Linija retinama serveryje: pilna Panevėžys–Oslas yra apie 418 KB, o
    // ekrane skirtumo nesimato.
    const line = thinRouteLine(
      parseRouteLine((payload as { polyline?: unknown }).polyline),
    );

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
      avoidedFerries: avoidFerries,
      days: suggestedDays(estimate.travelHours),
      fromAddress: from.formattedAddress,
      toAddress: to.formattedAddress,
      // Pasirinktas variantas laikomas tiksliu: žmogus jį matė ir patvirtino.
      approximate: [from, to].some(
        (place) => place.locationType !== "EXACT_ADDRESS" && place.locationType !== "PICKED",
      ),
      violated: estimate.violated,
      violations: estimate.violations,
      line,
      emissions: routeEmissions(payload, estimate.km),
      weightsUsed: hasWeights(weights),
    };
  } catch (cause) {
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
            `PTV nerado vilkikui tinkamo kelio tarp „${origin}“ ir „${destination}“. `
            + "Dažniausia priežastis – tikslus namo taškas gatvėje, kuri uždara sunkiasvorėms. "
            + "Pabandykite nurodyti miestą arba artimiausią didesnę gatvę.",
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

export type ScheduleLookupResult =
  | { ok: true; schedule: RouteSchedule }
  | { ok: false; message: string };

/**
 * Vairuotojo pertraukos, poilsis ir teisėtas atvykimas (#87).
 *
 * Atskira užklausa nuo maršruto sąmoningai: tvarkaraštis prieinamas tik per
 * POST, jo reikia ne kiekvienam skaičiavimui, o kiekvienas kreipimasis į PTV
 * kainuoja laiką ir mėnesio limitą.
 */
export async function lookupSchedule(
  origin: string,
  destination: string,
  fromPoint: string | undefined,
  toPoint: string | undefined,
  departureAt: string,
  scenario: DriverScenario,
  alreadyDrivenHours = 0,
): Promise<ScheduleLookupResult> {
  const key = process.env.PTV_API_KEY?.trim();
  if (!key) return { ok: false, message: "Maršrutų skaičiavimas neįjungtas." };

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { ok: false, message: "Prisijunkite iš naujo." };

  // Be išvykimo laiko tvarkaraščio nėra prasmės: pertraukos ir poilsis
  // skaičiuojami nuo konkretaus momento.
  if (!departureAt) {
    return { ok: false, message: "Įveskite reiso datą ir išvykimo laiką." };
  }

  try {
    const [from, to] = await Promise.all([
      pickedPoint(fromPoint, origin) ?? geocode(origin, key),
      pickedPoint(toPoint, destination) ?? geocode(destination, key),
    ]);

    if (!from) return { ok: false, message: `Nepavyko rasti adreso „${origin}“.` };
    if (!to) return { ok: false, message: `Nepavyko rasti adreso „${destination}“.` };

    const url = new URL(PTV_ROUTING_URL);
    url.searchParams.set("profile", PTV_TRUCK_PROFILE);
    url.searchParams.set("results", PTV_SCHEDULE_RESULTS);
    url.searchParams.set("options[startTime]", departureAt);

    const response = await fetch(url, {
      method: "POST",
      headers: { apiKey: key, "Content-Type": "application/json" },
      body: JSON.stringify(
        scheduleRequestBody(from, to, scenario, departureAt, alreadyDrivenHours),
      ),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new PtvError(response.status, (await response.text()).slice(0, 500));
    }

    const schedule = routeSchedule(await response.json());
    if (!schedule) {
      return { ok: false, message: "PTV negrąžino vairavimo laiko ataskaitos." };
    }

    return { ok: true, schedule };
  } catch (cause) {
    if (cause instanceof PtvError) {
      console.error("PTV atmetė tvarkaraščio užklausą", cause.status, cause.body);
      return { ok: false, message: `Vairavimo laiko paslauga grąžino klaidą ${cause.status}.` };
    }

    console.error("Nepavyko pasiekti PTV tvarkaraščio", cause);
    return { ok: false, message: "Nepavyko susisiekti su maršrutų paslauga." };
  }
}
