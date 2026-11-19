/**
 * Tušti km iki pakrovimo – nuo ten, kur fura iš tikrųjų yra ar bus.
 *
 * Pirmumo tvarka (vartotojo sprendimas, 2026-11-19):
 * - dispečeris įrašė, kur fura tuo metu bus – nuo ten;
 * - Telematikoje yra jos suplanuotas, dar neįvykęs iškrovimas – nuo jo;
 * - kitaip – nuo jos GPS vietos dabar.
 *
 * Šaltinis visada parodomas formoje, kad nebūtų neaišku, nuo ko skaičiuota
 * (2026-11-05 tas pats krovinys tyliai gaudavo 1 465 arba ~1 600 tuščių km).
 */

export interface TruckGps {
  latitude: number;
  longitude: number;
  /** Tiekėjo laikas „2026-10-31 09:12:00“, Lietuvos. */
  gpsTime: string;
}

export type EmptyRunStart =
  | { source: "gps"; latitude: number; longitude: number; gpsTime: string }
  | { source: "manual"; address: string; /** „55.7,24.3“ arba tuščia. */ point: string }
  /** Telematikos užsakymo iškrovimas; `end` – „2026-11-04 04:00:00“, Lietuvos laikas. */
  | { source: "order"; address: string; point: string; city: string; end: string };

/** Telematikos užsakymo atkarpa (iš `parseOrderLegs`) – tik tai, ko reikia čia. */
export interface PlannedLeg {
  plate: string | null;
  end: string;
  endPlace: string;
  endType: string | null;
  external: boolean;
}

/**
 * Kur fura išsikraus prieš krovinį: vėliausias jos dar neįvykęs iškrovimas.
 * Įvedus krovinio datą – ne vėlesnis už ją (vėlesnis reiškia, kad tą dieną
 * fura dar užimta kitu kroviniu). Be datos – tiesiog paskutinis suplanuotas.
 */
export function plannedUnloading(
  legs: PlannedLeg[],
  plateKeyOf: (plate: string) => string,
  plate: string,
  now: string,
  quoteDate: string,
): PlannedLeg | null {
  const key = plateKeyOf(plate);
  let best: PlannedLeg | null = null;
  for (const leg of legs) {
    if (leg.external || !leg.plate || plateKeyOf(leg.plate) !== key) continue;
    if ((leg.endType ?? "").toLowerCase() !== "unloading" || !leg.endPlace.trim()) continue;
    if (leg.end < now || (quoteDate && leg.end.slice(0, 10) > quoteDate)) continue;
    if (!best || leg.end > best.end) best = leg;
  }
  return best;
}

/** Pradžia: įrašyta vieta, tada suplanuotas iškrovimas, tada GPS. `null` – nėra nei vieno. */
export function emptyRunStart(
  manual: { address: string; point: string } | null,
  gps: TruckGps | null,
  order: Extract<EmptyRunStart, { source: "order" }> | null = null,
): EmptyRunStart | null {
  if (manual && (manual.address.trim() || manual.point)) return { source: "manual", address: manual.address.trim(), point: manual.point };
  if (order) return order;
  return gps ? { source: "gps", ...gps } : null;
}

/** Viena eilutė: kiek ir nuo kur – kad visada matytųsi šaltinis. */
export function emptyRunShort(start: EmptyRunStart, km: number): string {
  const kmText = Math.round(km).toLocaleString("lt-LT").replace(/\s/g, " ");
  const from = start.source === "manual"
    ? `nuo įrašytos vietos ${start.address}`
    : start.source === "order"
      ? `nuo suplanuoto iškrovimo ${start.city} (${start.end.slice(5, 16)}, Telematika)`
      : `nuo furos vietos dabar (GPS, ${start.gpsTime.slice(0, 16)})`;
  return `Tušti km iki pakrovimo: ${kmText} km ${from}.`;
}
