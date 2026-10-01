"use server";

import { MIN_ADDRESS_QUERY } from "@/lib/address-suggest";
import { parseRouteLine, simplifyRouteLine, type LineCoordinate } from "@/lib/route-line";
import {
  firstPlace,
  routeEstimate,
  routeFill,
  routeRequestUrl,
  routeTiming,
  type RouteTiming,
  PTV_GEOCODING_URL,
  PTV_ROUTING_URL,
  PTV_TRUCK_PROFILE,
  type GeocodedPlace,
  type RouteViolation,
  type RouteFill,
} from "@/lib/ptv-route";
import {
  routeSchedule,
  scheduleRequestBody,
  PTV_SCHEDULE_RESULTS,
  type DriverScenario,
  type RouteSchedule,
} from "@/lib/ptv-schedule";
import {
  compareRouteOptions,
  type FuelBasis,
  type RouteOption,
} from "@/lib/route-options";
import { geocode, pickedPoint, ptvJson, PtvError } from "./route-core";
import { createServerSupabaseClient } from "@/lib/supabase-server";

/**
 * Pasirinkto pasiūlymo koordinatės (#73).
 *
 * PTV pasiūlymai koordinačių neturi, todėl pasirinkus geokoduojamas jų
 * `searchText`. Tai viena užklausa už pasirinkimą, ne už klavišą.
 *
 * `null`, jei nerasta: forma išlieka veikianti, o maršrutas geokoduos tekstą.
 */
export async function resolveAddress(
  searchText: string,
): Promise<Pick<GeocodedPlace, "latitude" | "longitude" | "formattedAddress"> | null> {
  if (searchText.trim().length < MIN_ADDRESS_QUERY) return null;

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return null;

  const key = process.env.PTV_API_KEY?.trim();
  if (!key) return null;

  try {
    const url = `${PTV_GEOCODING_URL}?searchText=${encodeURIComponent(searchText)}&language=lt`;
    return firstPlace(await ptvJson(url, key));
  } catch {
    return null;
  }
}

export interface RouteOptionResult extends RouteOption {
  fill: RouteFill;
  line: LineCoordinate[];
  violations: RouteViolation[];
}

export type RouteOptionsResult =
  | { ok: true; options: RouteOptionResult[]; fromAddress: string; toAddress: string }
  | { ok: false; message: string };

/** Vieno varianto duomenys: mokesčiai, linija ir pažeidimai. */
function optionUrl(routeId: string | null, from: GeocodedPlace, to: GeocodedPlace, avoidFerries: boolean, timing: RouteTiming | null): string {
  if (routeId === null) {
    return routeRequestUrl(from, to, avoidFerries, timing ?? undefined);
  }

  const url = new URL(PTV_ROUTING_URL);
  url.searchParams.set("profile", PTV_TRUCK_PROFILE);
  url.searchParams.set(
    "results",
    "TOLL_COSTS,TOLL_SECTIONS,COMBINED_TRANSPORT_EVENTS,VIOLATION_EVENTS,POLYLINE",
  );
  url.searchParams.set("options[currency]", "EUR");
  url.searchParams.set("routeId", routeId);
  return url.toString();
}

/**
 * Keli PTV keliai su kaštais (#84).
 *
 * PTV alternatyvas grąžina be mokesčių — tik su `routeId`. Kiekvieno varianto
 * kaina paimama atskira užklausa pagal tą raktą; kitaip lentelėje būtų
 * kilometrai be pinigų, o būtent pinigai čia ir skiriasi.
 */
export async function lookupRouteOptions(
  origin: string,
  destination: string,
  fromPoint: string | undefined,
  toPoint: string | undefined,
  avoidFerries: boolean,
  departureAt: string | undefined,
  fuel: FuelBasis,
): Promise<RouteOptionsResult> {
  const key = process.env.PTV_API_KEY?.trim();
  if (!key) return { ok: false, message: "Maršrutų skaičiavimas neįjungtas." };

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { ok: false, message: "Prisijunkite iš naujo." };

  const timing = routeTiming(departureAt);
  if (!timing) return { ok: false, message: "Neteisinga išvykimo data arba laikas." };

  try {
    const [from, to] = await Promise.all([
      pickedPoint(fromPoint, origin) ?? geocode(origin, key),
      pickedPoint(toPoint, destination) ?? geocode(destination, key),
    ]);

    if (!from) return { ok: false, message: `Nepavyko rasti adreso „${origin}“.` };
    if (!to) return { ok: false, message: `Nepavyko rasti adreso „${destination}“.` };

    const listUrl = new URL(PTV_ROUTING_URL);
    listUrl.searchParams.append("waypoints", `${from.latitude},${from.longitude}`);
    listUrl.searchParams.append("waypoints", `${to.latitude},${to.longitude}`);
    listUrl.searchParams.set("profile", PTV_TRUCK_PROFILE);
    listUrl.searchParams.set("results", "ALTERNATIVE_ROUTES");
    if (avoidFerries) listUrl.searchParams.set("options[avoid]", "FERRIES");

    const list = await ptvJson(listUrl.toString(), key);
    const alternatives = Array.isArray((list as { alternativeRoutes?: unknown }).alternativeRoutes)
      ? ((list as { alternativeRoutes: unknown[] }).alternativeRoutes)
      : [];

    const routeIds: (string | null)[] = [
      null,
      ...alternatives.flatMap((row) => {
        const id = (row as { routeId?: unknown }).routeId;
        return typeof id === "string" ? [id] : [];
      }),
    ];

    const loaded = await Promise.all(
      routeIds.map(async (routeId) => {
        const payload = await ptvJson(optionUrl(routeId, from, to, avoidFerries, timing), key);
        const estimate = routeEstimate(payload);
        if (!estimate) return null;

        return {
          estimate: { ...estimate, routeId },
          fill: routeFill(estimate),
          line: simplifyRouteLine(parseRouteLine((payload as { polyline?: unknown }).polyline)),
        };
      }),
    );

    const usable = loaded.filter((row): row is NonNullable<typeof row> => row !== null);
    if (usable.length === 0) {
      return { ok: false, message: "Nepavyko suskaičiuoti maršruto variantų." };
    }

    const compared = compareRouteOptions(usable.map((row) => row.estimate), fuel);

    return {
      ok: true,
      fromAddress: from.formattedAddress,
      toAddress: to.formattedAddress,
      options: compared.map((option) => {
        const extra = usable.find((row) => row.estimate.routeId === option.routeId);
        return {
          ...option,
          fill: extra?.fill ?? routeFill(option),
          line: extra?.line ?? [],
          violations: option.violations,
        };
      }),
    };
  } catch (cause) {
    if (cause instanceof PtvError) {
      console.error("PTV atmetė variantų užklausą", cause.status, cause.body);
      return { ok: false, message: `Maršrutų paslauga grąžino klaidą ${cause.status}.` };
    }

    console.error("Nepavyko pasiekti PTV variantų", cause);
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
