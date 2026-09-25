/**
 * PTV Developer: adresas -> maršrutas -> kilometrai ir kelių mokesčiai (#61).
 *
 * Šitas failas tik **verčia** PTV atsakymą į tai, ką supranta reiso forma.
 * Užklausos gyvena server action'e, nes raktas į naršyklę patekti negali.
 *
 * Kodėl verta: iki šiol šalių atkarpos vedamos ranka, ir suklydus km
 * pasiskirstyme klysta kelių kaštai, o klaida nematoma — skaičius atrodo
 * tvarkingas. PTV mokesčius pasako tiesiogiai, tad spėti nebereikia.
 */

import { PTV_EMISSIONS_RESULT, weightParams, type VehicleWeights } from "./ptv-emissions";
import type { ViaPoint } from "./via-points";

export const PTV_GEOCODING_URL = "https://api.myptv.com/geocoding/v1/locations/by-text";
export const PTV_ROUTING_URL = "https://api.myptv.com/routing/v1/routes";

/** 40 t vilkikas. Kiti profiliai duotų kitus mokesčius ir kitus draudimus. */
export const PTV_TRUCK_PROFILE = "EUR_TRUCK_40T";

export type PtvTrafficMode = "REALISTIC" | "AVERAGE";

export interface RouteTiming {
  /** ISO 8601 UTC laikas. Be jo PTV skaičiuoja išvykstant dabar. */
  startTime?: string;
  trafficMode: PtvTrafficMode;
}

export interface GeocodedPlace {
  latitude: number;
  longitude: number;
  /** PTV sutvarkytas adresas — parodomas, kad matytųsi, ką jis suprato. */
  formattedAddress: string;
  /** `EXACT_ADDRESS`, `LOCALITY` ir pan. Netikslus taškas duoda netikslius km. */
  locationType: string;
}

export interface CountryToll {
  countryCode: string;
  euroCents: number;
}

export interface RouteViolation {
  type: string;
  property?: string;
  message: string;
  countryCode?: string;
  distanceKm: number;
  latitude?: number;
  longitude?: number;
  temporary: boolean;
  timeRestricted: boolean;
}

export interface RouteEstimate {
  km: number;
  /** Kelio laikas be poilsio ir laukimo. Reiso trukmė visada ilgesnė. */
  travelHours: number;
  travelMinutes: number;
  /** Tik gyvo eismo pridėtas vėlavimas. PTV grąžina sekundėmis. */
  trafficDelayMinutes: number;
  tollCents: number;
  /** Bendri keliai, miestų rinkliavos, vinjetės, tiltai ir kalnų perėjos. */
  bridgesCents: number;
  ferriesCents: number;
  tunnelsCents: number;
  /** Keltas aptinkamas ir tada, kai PTV neturi jo bilieto kainos. */
  ferryDetected: boolean;
  ferryNames: string[];
  byCountry: CountryToll[];
  /** PTV neranda vilkikui tinkamo kelio arba jis pažeidžia ribojimus. */
  violated: boolean;
  violations: RouteViolation[];
}

function decimal(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Gyvas eismas prasmingas tik išvykstant dabar arba per kelias valandas.
 * Tolimesnei datai PTV naudoja tipinius tos savaitės dienos srautus.
 */
export function routeTiming(
  startTime?: string,
  now = new Date(),
): RouteTiming | null {
  if (!startTime) return { trafficMode: "REALISTIC" };

  const departure = new Date(startTime);
  if (Number.isNaN(departure.getTime())) return null;

  const difference = departure.getTime() - now.getTime();
  const liveWindow = 6 * 60 * 60 * 1000;
  const recentlyPassed = -5 * 60 * 1000;

  return {
    startTime: departure.toISOString(),
    trafficMode:
      difference >= recentlyPassed && difference <= liveWindow
        ? "REALISTIC"
        : "AVERAGE",
  };
}

function euroCents(value: unknown): number | null {
  if (typeof value !== "object" || value === null) return null;
  const money = value as Record<string, unknown>;
  const price = decimal(money.price);
  return price === null ? null : Math.round(price * 100);
}

/**
 * PTV pirmą sekcijos kainą naudoja bendrai maršruto sumai. `convertedPrice`
 * prašome eurais; atsarginis kelias tinka tik jau eurais grąžintai kainai.
 */
function sectionCents(section: Record<string, unknown>): number | null {
  const costs = Array.isArray(section.costs) ? section.costs : [];
  const first = costs[0];
  if (typeof first !== "object" || first === null) return null;
  const cost = first as Record<string, unknown>;
  const converted = euroCents(cost.convertedPrice);
  if (converted !== null) return converted;
  return cost.currency === "EUR" ? euroCents(cost) : null;
}

function ltNumber(value: number): string {
  return String(Math.round(value * 100) / 100).replace(".", ",");
}

function vehiclePropertyMessage(property: string, limit: number | null, value: string | null): string {
  const tonnes = limit === null ? null : `${ltNumber(limit / 1000)} t`;
  const metres = limit === null ? null : `${ltNumber(limit / 100)} m`;

  switch (property) {
    case "WEIGHT":
      return tonnes ? `Vilkiko svoris viršija ${tonnes} ribą.` : "Viršyta vilkiko svorio riba.";
    case "TOTAL_PERMITTED_WEIGHT":
      return tonnes ? `Leistina bendra masė viršija ${tonnes} ribą.` : "Viršyta leistinos bendros masės riba.";
    case "AXLE_WEIGHT":
      return tonnes ? `Ašies svoris viršija ${tonnes} ribą.` : "Viršyta ašies svorio riba.";
    case "HEIGHT":
      return metres ? `Vilkiko aukštis viršija ${metres} ribą.` : "Viršyta vilkiko aukščio riba.";
    case "LENGTH":
    case "KPRA_LENGTH":
      return metres ? `Vilkiko ilgis viršija ${metres} ribą.` : "Viršyta vilkiko ilgio riba.";
    case "WIDTH":
      return metres ? `Vilkiko plotis viršija ${metres} ribą.` : "Viršyta vilkiko pločio riba.";
    case "NUMBER_OF_AXLES":
      return limit === null ? "Netinkamas ašių skaičius." : `Ašių skaičius viršija ${limit} ribą.`;
    case "LOW_EMISSION_ZONE":
      return value ? `Vilkikas neatitinka mažos taršos zonos „${value}“ reikalavimų.` : "Vilkikas neatitinka mažos taršos zonos reikalavimų.";
    case "TRUCK_ROUTE":
      return value ? `Vilkikui neleidžiamas sunkvežimių maršrutas „${value}“.` : "Vilkikui neleidžiamas šis sunkvežimių maršrutas.";
    case "HAZARDOUS_MATERIALS":
      return value ? `Šiame kelyje draudžiamos pavojingos medžiagos: ${value}.` : "Šiame kelyje draudžiamas pavojingas krovinys.";
    case "TUNNEL_RESTRICTION":
      return value ? `Tunelyje leidžiamas tik apribojimo kodas ${value}.` : "Vilkikas neatitinka tunelio apribojimo.";
    case "TRAILER":
      return "Priekaba šiame kelyje neleidžiama.";
    default:
      return `PTV grąžino neatpažintą vilkiko apribojimą „${property}“${value ? ` (${value})` : ""}.`;
  }
}

function violationMessage(
  type: string,
  scheduleTypes: string[],
): string {
  switch (type) {
    case "PROHIBITED":
      return "Kelias draudžiamas šiam vilkikui.";
    case "DELIVERY_ONLY":
      return "Keliu leidžiama važiuoti tik pristatymo transportui.";
    case "URBAN":
      return "Šiam vilkikui draudžiamas miesto kelias.";
    case "RESIDENTS_ONLY":
      return "Keliu leidžiama važiuoti tik gyventojams.";
    case "RESTRICTED_ACCESS":
      return "Ribotas patekimas: vartai, užtvaras arba reikalingas leidimas.";
    case "VEHICLE_PROPERTY":
      return "Vilkiko parametrai neatitinka kelio apribojimo.";
    case "COMBINED_TRANSPORT":
      return "Keltas arba traukinio jungtis neveža šio tipo vilkiko.";
    case "SCHEDULE":
      return scheduleTypes.length
        ? `Pažeistas darbo laiko arba aptarnavimo grafikas: ${scheduleTypes.join(", ")}.`
        : "Pažeistas darbo laiko arba aptarnavimo grafikas.";
    case "BLOCKED_ROAD_BY_INTERSECTION":
      return "Maršrutas kerta užblokuotą kelią.";
    default:
      return `PTV grąžino neatpažintą apribojimą „${type}“.`;
  }
}

function routeViolations(events: unknown[]): RouteViolation[] {
  const violations: RouteViolation[] = [];
  const seen = new Set<string>();

  for (const row of events) {
    if (typeof row !== "object" || row === null) continue;
    const event = row as Record<string, unknown>;
    if (typeof event.violation !== "object" || event.violation === null) continue;
    const violation = event.violation as Record<string, unknown>;
    if (violation.accessType === "EXIT") continue;

    const type = text(violation.type) ?? "UNKNOWN";
    const countryCode = text(event.countryCode) ?? undefined;
    const distanceKm = Math.max(
      0,
      Math.round(((decimal(event.distanceFromStart) ?? 0) / 1000) * 10) / 10,
    );
    const rawLatitude = decimal(event.latitude);
    const rawLongitude = decimal(event.longitude);
    const latitude = rawLatitude !== null && rawLatitude >= -90 && rawLatitude <= 90
      ? rawLatitude
      : undefined;
    const longitude = rawLongitude !== null && rawLongitude >= -180 && rawLongitude <= 180
      ? rawLongitude
      : undefined;
    const temporary = violation.temporary === true;
    const timeRestricted = text(violation.timeDomain) !== null;
    const scheduleTypes = Array.isArray(violation.scheduleViolationTypes)
      ? violation.scheduleViolationTypes.filter((item): item is string => typeof item === "string")
      : [];
    const properties = Array.isArray(violation.violatedVehicleProperties)
      ? violation.violatedVehicleProperties
      : [];
    const parsedProperties = properties.flatMap((item) => {
      if (typeof item !== "object" || item === null) return [];
      const propertyRow = item as Record<string, unknown>;
      const property = text(propertyRow.property) ?? text(propertyRow.name);
      if (!property) return [];
      return [{
        property,
        message: vehiclePropertyMessage(
          property,
          decimal(propertyRow.limit),
          text(propertyRow.value),
        ),
      }];
    });
    const reasons = parsedProperties.length > 0
      ? parsedProperties
      : [{ property: undefined, message: violationMessage(type, scheduleTypes) }];

    for (const reason of reasons) {
      const key = [type, reason.property, countryCode, distanceKm, reason.message].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push({
        type,
        property: reason.property,
        message: reason.message,
        countryCode,
        distanceKm,
        latitude,
        longitude,
        temporary,
        timeRestricted,
      });
    }
  }

  return violations;
}

/** PTV URL vienoje vietoje, kad `avoid` sintaksė nebūtų spėjama formoje. */
export function routeRequestUrl(
  from: Pick<GeocodedPlace, "latitude" | "longitude">,
  to: Pick<GeocodedPlace, "latitude" | "longitude">,
  avoidFerries: boolean,
  timing?: RouteTiming,
  weights?: VehicleWeights,
  via: ViaPoint[] = [],
): string {
  const url = new URL(PTV_ROUTING_URL);
  url.searchParams.append("waypoints", `${from.latitude},${from.longitude}`);
  // Tarpiniai taškai eina tarp pradžios ir pabaigos: PTV maršrutą veda per juos
  // ta tvarka, kuria jie surašyti (#85).
  for (const point of via) {
    url.searchParams.append("waypoints", `${point.latitude},${point.longitude}`);
  }
  url.searchParams.append("waypoints", `${to.latitude},${to.longitude}`);
  url.searchParams.set("profile", PTV_TRUCK_PROFILE);
  // Emisijos prašomos visada: jos nekainuoja atskiros užklausos, o be svorių
  // PTV tiesiog ima savo numatytąsias reikšmes (#86).
  url.searchParams.set(
    "results",
    `TOLL_COSTS,TOLL_SECTIONS,COMBINED_TRANSPORT_EVENTS,VIOLATION_EVENTS,POLYLINE,${PTV_EMISSIONS_RESULT}`,
  );
  url.searchParams.set("options[currency]", "EUR");
  if (timing?.startTime) {
    url.searchParams.set("options[startTime]", timing.startTime);
    url.searchParams.set("options[trafficMode]", timing.trafficMode);
  }
  if (avoidFerries) url.searchParams.set("options[avoid]", "FERRIES");
  for (const [name, value] of Object.entries(weightParams(weights ?? {}))) {
    url.searchParams.set(name, value);
  }
  return url.toString();
}

function toPlace(row: unknown): GeocodedPlace | null {
  if (typeof row !== "object" || row === null) return null;
  const location = row as Record<string, unknown>;
  const position = location.referencePosition as Record<string, unknown> | undefined;
  const latitude = decimal(position?.latitude);
  const longitude = decimal(position?.longitude);
  if (latitude === null || longitude === null) return null;

  return {
    latitude,
    longitude,
    formattedAddress: text(location.formattedAddress) ?? "",
    locationType: text(location.locationType) ?? "",
  };
}

/**
 * Keli variantai pasirinkimui (#65).
 *
 * „Klaipėdos g. 4" PTV grąžina 42 adresus keturiuose miestuose, visus vienodo
 * tikslumo. Pirmas sąraše yra atsitiktinis, todėl rinktis turi žmogus.
 */
export function placeSuggestions(payload: unknown, limit = 6): GeocodedPlace[] {
  if (typeof payload !== "object" || payload === null) return [];
  const locations = (payload as { locations?: unknown }).locations;
  if (!Array.isArray(locations)) return [];

  const places: GeocodedPlace[] = [];
  const seen = new Set<string>();

  for (const row of locations) {
    const place = toPlace(row);
    // Tas pats adresas kartojasi skirtingais įrašais; sąraše to matyti nereikia.
    if (!place || place.formattedAddress === "" || seen.has(place.formattedAddress)) continue;
    seen.add(place.formattedAddress);
    places.push(place);
    if (places.length >= limit) break;
  }

  return places;
}

/**
 * Pirmas rastas taškas, arba `null`, jei adresas neatpažintas.
 *
 * Naudojama tik tada, kai vartotojas varianto nepasirinko. Tada spėjimas
 * paženklinamas, o ne pateikiamas kaip tiesa.
 */
export function firstPlace(payload: unknown): GeocodedPlace | null {
  return placeSuggestions(payload, 1)[0] ?? null;
}

/**
 * PTV maršruto atsakymas į įvertį.
 *
 * Mokesčiai imami iš `convertedPrice` — PTV pats perskaičiuoja zlotus, kronas
 * ir kitas valiutas į eurus. Savo kurso čia netaikome: PTV kursas eina kartu
 * su jų tarifais, tad maišyti šaltinius būtų blogiau.
 */
export function routeEstimate(payload: unknown): RouteEstimate | null {
  if (typeof payload !== "object" || payload === null) return null;
  const source = payload as Record<string, unknown>;

  const metres = decimal(source.distance);
  if (metres === null) return null;

  const seconds = decimal(source.travelTime) ?? 0;
  const trafficDelaySeconds = Math.max(0, decimal(source.trafficDelay) ?? 0);

  const toll = source.toll as Record<string, unknown> | undefined;
  const costs = toll?.costs as Record<string, unknown> | undefined;
  const countries = Array.isArray(costs?.countries) ? costs.countries : [];

  const byCountry: CountryToll[] = [];
  for (const row of countries) {
    if (typeof row !== "object" || row === null) continue;
    const entry = row as Record<string, unknown>;
    const code = text(entry.countryCode);
    const converted = entry.convertedPrice as Record<string, unknown> | undefined;
    const price = decimal(converted?.price);
    if (code === null || price === null) continue;
    byCountry.push({ countryCode: code, euroCents: Math.round(price * 100) });
  }

  const countryTotal = byCountry.reduce((total, row) => total + row.euroCents, 0);
  const convertedTotal = euroCents(costs?.convertedPrice);
  const sections = Array.isArray(toll?.sections) ? toll.sections : [];
  let sectionTotal = 0;
  let ferriesCents = 0;
  let tunnelsCents = 0;
  let ferrySectionFound = false;

  for (const row of sections) {
    if (typeof row !== "object" || row === null) continue;
    const section = row as Record<string, unknown>;
    const roadType = text(section.tollRoadType);
    const cents = sectionCents(section);
    if (roadType === "FERRY") ferrySectionFound = true;
    if (cents === null) continue;
    sectionTotal += cents;
    if (roadType === "FERRY") ferriesCents += cents;
    if (roadType === "TUNNEL") tunnelsCents += cents;
  }

  const tollCents = convertedTotal ?? (byCountry.length > 0 ? countryTotal : sectionTotal);
  // Visa, kas nėra keltas ar tunelis, lieka bendrame kelių / tiltų lauke.
  // Taip išsaugoma tiksli PTV bendra suma net esant centų apvalinimo skirtumui.
  const bridgesCents = Math.max(0, tollCents - ferriesCents - tunnelsCents);

  const events = Array.isArray(source.events) ? source.events : [];
  const violations = routeViolations(events);
  const ferryNames: string[] = [];
  for (const row of events) {
    if (typeof row !== "object" || row === null) continue;
    const event = row as Record<string, unknown>;
    const combined = event.combinedTransport as Record<string, unknown> | undefined;
    if (combined?.type !== "BOAT" || combined.accessType !== "ENTER") continue;
    const name = text(combined.name);
    if (name && !ferryNames.includes(name)) ferryNames.push(name);
  }

  return {
    km: Math.round((metres / 1000) * 100) / 100,
    travelHours: Math.round((seconds / 3600) * 10) / 10,
    travelMinutes: Math.round(seconds / 60),
    trafficDelayMinutes: Math.round(trafficDelaySeconds / 60),
    tollCents,
    bridgesCents,
    ferriesCents,
    tunnelsCents,
    ferryDetected: ferrySectionFound || ferryNames.length > 0,
    ferryNames,
    byCountry,
    violated: source.violated === true,
    violations,
  };
}

/** Reiso formos laukai, kuriuos užpildo maršrutas. */
export interface RouteFill {
  paid_km: string;
  bridges_cents: string;
  ferries_cents: string;
  tunnels_cents: string;
  legKm: string;
}

/**
 * Įvertis į formos reikšmes.
 *
 * `days` čia nėra sąmoningai: kelio laikas nėra reiso trukmė. Vairuotojas
 * miega, laukia pakrovimo ir stovi pasienyje, o furos paros kaštai skaičiuojami
 * nuo parų — todėl spėta trukmė tyliai iškreiptų pelną. Trukmę siūlome
 * atskirai, kad žmogus ją patvirtintų.
 */
export function routeFill(estimate: RouteEstimate): RouteFill {
  return {
    paid_km: estimate.km.toFixed(2),
    bridges_cents: (estimate.bridgesCents / 100).toFixed(2),
    // Aptiktas keltas be kainos nėra nemokamas. Tuščias laukas priverčia
    // įvesti kainą arba pritaikyti konkretaus operatoriaus tarifą.
    ferries_cents:
      estimate.ferryDetected && estimate.ferriesCents === 0
        ? ""
        : (estimate.ferriesCents / 100).toFixed(2),
    tunnels_cents: (estimate.tunnelsCents / 100).toFixed(2),
    legKm: estimate.km.toFixed(2),
  };
}

/** Kiek parų siūlyti: kelio laikas plius poilsis, apvalinant į viršų. */
export function suggestedDays(travelHours: number): number {
  // Vairuotojui leidžiama vairuoti ~9 val. per parą, tad para kelio yra ~9 val.
  return Math.max(1, Math.ceil(travelHours / 9));
}
