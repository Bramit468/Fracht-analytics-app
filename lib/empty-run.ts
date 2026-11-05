/**
 * Tušti km iki pakrovimo – nuo ten, kur fura iš tikrųjų yra ar bus.
 *
 * Tik du variantai (vartotojo sprendimas, 2026-11-05):
 * - dispečeris įrašė, kur fura tuo metu bus – nuo ten;
 * - neįrašė – nuo jos GPS vietos dabar (Telematika).
 *
 * Anksčiau dar buvo ieškoma reiso ar Telematikos užsakymo iškrovimo, bet
 * pradžia tada tyliai šokinėdavo tarp šaltinių – tas pats krovinys gaudavo
 * 1 465 arba ~1 600 tuščių km. Dabar visada aišku, nuo ko skaičiuota.
 */

export interface TruckGps {
  latitude: number;
  longitude: number;
  /** Tiekėjo laikas „2026-10-31 09:12:00“, Lietuvos. */
  gpsTime: string;
}

export type EmptyRunStart =
  | { source: "gps"; latitude: number; longitude: number; gpsTime: string }
  | { source: "manual"; address: string; /** „55.7,24.3“ arba tuščia. */ point: string };

/** Pradžia: įrašyta vieta, kitaip GPS. `null` – nėra nei vieno. */
export function emptyRunStart(manual: { address: string; point: string } | null, gps: TruckGps | null): EmptyRunStart | null {
  if (manual && (manual.address.trim() || manual.point)) return { source: "manual", address: manual.address.trim(), point: manual.point };
  return gps ? { source: "gps", ...gps } : null;
}

/** Viena eilutė: kiek ir nuo kur – kad visada matytųsi šaltinis. */
export function emptyRunShort(start: EmptyRunStart, km: number): string {
  const kmText = Math.round(km).toLocaleString("lt-LT").replace(/\s/g, " ");
  const from = start.source === "manual"
    ? `nuo įrašytos vietos ${start.address}`
    : `nuo furos vietos dabar (GPS, ${start.gpsTime.slice(0, 16)})`;
  return `Tušti km iki pakrovimo: ${kmText} km ${from}.`;
}
