/**
 * Reiso sustojimai: pakrovimas, iškrovimas ir papildomi sustojimai.
 *
 * Tai vienintelis sustojimų šaltinis: forma, žemėlapis ir maršruto užklausa
 * skaito tą patį sąrašą. Pirmas sustojimas visada yra pakrovimas, paskutinis –
 * iškrovimas; ką skaičiavimas darys su papildomais, kol kas nenuspręsta, todėl
 * jie tik išsaugomi ir pateikiami (`countStopsByType`).
 */

import type { ViaPoint } from "./via-points";

export const STOP_TYPES = [
  "loading",
  "unloading",
  "extra_loading",
  "extra_unloading",
  "cmr_handover",
  "customs",
  "other",
] as const;

export type StopType = (typeof STOP_TYPES)[number];

export const STOP_TYPE_LABELS: Record<StopType, string> = {
  loading: "Pakrovimas",
  unloading: "Iškrovimas",
  extra_loading: "Papildomas pakrovimas",
  extra_unloading: "Papildomas iškrovimas",
  cmr_handover: "CMR perdavimas",
  customs: "Muitinės sustojimas",
  other: "Kitas sustojimas",
};

/** Tipai, kuriuos galima rinktis tarp pirmo ir paskutinio sustojimo. */
export const EXTRA_STOP_TYPES: readonly StopType[] = STOP_TYPES.filter(
  (type) => type !== "loading" && type !== "unloading",
);

/** Pradžia + pabaiga + papildomi. Daugiau nei PTV užklausa verta vesti ranka. */
export const MAX_STOPS = 8;

export interface Stop {
  /** Tik rakinimui sąraše: nekeičiamas keliant ir trinant kitus. */
  id: number;
  type: StopType;
  address: string;
  /** „55.7,24.3“ pasirinkus pasiūlymą; tuščia, jei adresas tik įrašytas. */
  point: string;
}

/** Tai, kas saugoma su reisu. */
export interface StoredStop {
  type: StopType;
  address: string;
  point: string;
}

/** Į maršruto užklausą: sustojimas (adresas) arba nutemptas tarpinis taškas. */
export type RouteWaypoint =
  | { kind: "stop"; address: string; point?: string }
  | { kind: "via"; latitude: number; longitude: number };

function isStopType(value: unknown): value is StopType {
  return typeof value === "string" && (STOP_TYPES as readonly string[]).includes(value);
}

/** Pirmas – pakrovimas, paskutinis – iškrovimas, o viduriniai – tik papildomi tipai. */
export function normalizeStops(stops: Stop[]): Stop[] {
  return stops.map((stop, index) => {
    if (index === 0) return stop.type === "loading" ? stop : { ...stop, type: "loading" };
    if (index === stops.length - 1) return stop.type === "unloading" ? stop : { ...stop, type: "unloading" };
    return EXTRA_STOP_TYPES.includes(stop.type) ? stop : { ...stop, type: "other" };
  });
}

/** Naujas sustojimas prieš iškrovimą. Pasiekus ribą grąžinamas tas pats sąrašas. */
export function addStop(stops: Stop[], id: number, type: StopType = "extra_unloading"): Stop[] {
  if (stops.length >= MAX_STOPS || stops.length < 2) return stops;
  const extra: Stop = { id, type: EXTRA_STOP_TYPES.includes(type) ? type : "other", address: "", point: "" };
  return [...stops.slice(0, -1), extra, stops[stops.length - 1]];
}

/** Pirmo ir paskutinio sustojimo trinti negalima: be jų nėra reiso. */
export function removeStop(stops: Stop[], index: number): Stop[] {
  if (index <= 0 || index >= stops.length - 1) return stops;
  return stops.filter((_, position) => position !== index);
}

/** Papildomą sustojimą perkelia per vieną vietą; pradžia ir pabaiga lieka savo vietose. */
export function moveStop(stops: Stop[], index: number, delta: -1 | 1): Stop[] {
  const target = index + delta;
  const inside = (position: number) => position > 0 && position < stops.length - 1;
  if (!inside(index) || !inside(target)) return stops;

  const next = [...stops];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function updateStop(stops: Stop[], index: number, change: Partial<Pick<Stop, "type" | "address" | "point">>): Stop[] {
  return normalizeStops(stops.map((stop, position) => (position === index ? { ...stop, ...change } : stop)));
}

/** A, B, C… žemėlapio ženklui. */
export function stopLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

export function countStopsByType(stops: readonly { type: StopType }[]): Record<StopType, number> {
  const counts = Object.fromEntries(STOP_TYPES.map((type) => [type, 0])) as Record<StopType, number>;
  for (const stop of stops) counts[stop.type] += 1;
  return counts;
}

export function toStoredStops(stops: Stop[]): StoredStop[] {
  return stops.map(({ type, address, point }) => ({ type, address, point }));
}

/**
 * Iš duomenų bazės. Senuose reisuose sustojimų nėra – tada iš pradžios ir
 * pabaigos sudaromi du, kad forma visada turėtų bent pakrovimą ir iškrovimą.
 */
export function stopsFromStored(value: unknown, origin = "", destination = "", firstId = 0): Stop[] {
  const rows = Array.isArray(value) ? value : [];
  const parsed: Stop[] = rows.flatMap((row, index) => {
    if (typeof row !== "object" || row === null) return [];
    const item = row as Record<string, unknown>;
    return [{
      id: firstId + index,
      type: isStopType(item.type) ? item.type : "other",
      address: typeof item.address === "string" ? item.address : "",
      point: typeof item.point === "string" ? item.point : "",
    }];
  });

  if (parsed.length >= 2) return normalizeStops(parsed.slice(0, MAX_STOPS));
  return [
    { id: firstId, type: "loading", address: origin, point: "" },
    { id: firstId + 1, type: "unloading", address: destination, point: "" },
  ];
}

/**
 * Sustojimai, kurie patenka į maršrutą: pradžia ir pabaiga visada, o tuščias
 * papildomas sustojimas (dar neįvestas adresas) praleidžiamas.
 */
export function routedStops(stops: Stop[]): Stop[] {
  return stops.filter(
    (stop, index) => index === 0 || index === stops.length - 1 || stop.address.trim() !== "" || stop.point !== "",
  );
}

/**
 * Užklausos taškai ta tvarka, kuria PTV turi važiuoti: sustojimas, tada tarpiniai
 * taškai, nutempti ant to ruožo, tada kitas sustojimas.
 */
export function buildWaypoints(allStops: Stop[], via: ViaPoint[]): RouteWaypoint[] {
  const stops = routedStops(allStops);
  const lastLeg = Math.max(0, stops.length - 2);
  const waypoints: RouteWaypoint[] = [];

  stops.forEach((stop, index) => {
    waypoints.push({ kind: "stop", address: stop.address, point: stop.point || undefined });
    if (index >= stops.length - 1) return;

    for (const point of via) {
      // Pasenęs ruožo numeris (sustojimų sąrašas sutrumpėjo) prisegamas prie paskutinio ruožo.
      if (Math.min(point.leg ?? 0, lastLeg) === index) {
        waypoints.push({ kind: "via", latitude: point.latitude, longitude: point.longitude });
      }
    }
  });

  return waypoints;
}
