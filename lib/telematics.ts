/**
 * Telematika.lt momentinių duomenų skaitytuvas (#44).
 *
 * Užklausa grąžina po vieną eilutę kiekvienam kliento objektui su tos akimirkos
 * būsena. `Odometer` ir `FuelConsumption` yra kaupiamieji skaitikliai, todėl
 * reiso km ir kuras gaunami iš dviejų nuotraukų skirtumo — bet tam nuotraukas
 * pirma reikia sukaupti.
 *
 * Nepaisant `/xml/` kelio, atsakymas yra JSON.
 */

import { normalizePlate } from "./truck";

export interface TelematicsSnapshot {
  objectId: string;
  /** Valstybinis numeris, suvienodintas taip pat kaip furų sąraše. */
  plate: string;
  /** "2026-09-22 19:06:44" — tiekėjo laikas, be zonos. Saugomas kaip gautas. */
  gpsTime: string;
  /** Šalis ISO3, pvz. "DEU". Gali nebūti. */
  country: string | null;
  ignition: boolean;
  /** Paskutinė žinoma vieta. `null`, jei tiekėjas koordinačių nedavė. */
  latitude: number | null;
  longitude: number | null;
  speedKmh: number | null;
  /** Kaupiamoji rida kilometrais. Gali nebūti. */
  odometerKm: number | null;
  /** Kaupiamosios kuro sąnaudos litrais. Dalis furų kuro daviklio neturi. */
  fuelL: number | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function decimal(value: unknown): number | null {
  const raw = text(value);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Tiekėjo `X` yra ilguma, `Y` – platuma (patikrinta su gyvu atsakymu). 0,0 ir
 * reikšmės už ribų laikomos nežinoma vieta: žymeklis Gvinėjos įlankoje klaidintų.
 */
function position(x: unknown, y: unknown): { latitude: number; longitude: number } | null {
  const longitude = decimal(x);
  const latitude = decimal(y);
  if (longitude === null || latitude === null) return null;
  if (longitude === 0 && latitude === 0) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/**
 * Atsakymą paverčia eilutėmis, kurias galima saugoti.
 *
 * `freshSince` atmeta seniai nesisiekusius objektus: sąraše lieka ir parduoti
 * vilkikai, kurių paskutiniai duomenys kelerių metų senumo.
 */
export function parseSnapshots(payload: unknown, freshSince?: string): TelematicsSnapshot[] {
  if (!Array.isArray(payload)) {
    throw new Error("Telematikos atsakymas turi būti sąrašas.");
  }

  const seen = new Set<string>();
  const snapshots: TelematicsSnapshot[] = [];

  for (const row of payload) {
    if (typeof row !== "object" || row === null) continue;
    const source = row as Record<string, unknown>;

    const objectId = text(source.ObjectId);
    const plate = text(source.Number);
    const gpsTime = text(source.GpsTime);
    if (!objectId || !plate || !gpsTime) continue;
    if (freshSince && gpsTime < freshSince) continue;

    // Tas pats objektas atsakyme pasitaiko dukart — antrą kartą praleidžiame.
    const key = `${objectId}|${gpsTime}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const place = position(source.X, source.Y);

    snapshots.push({
      objectId,
      plate: normalizePlate(plate),
      gpsTime,
      country: text(source.Country),
      ignition: text(source.Ignition) === "1",
      latitude: place?.latitude ?? null,
      longitude: place?.longitude ?? null,
      speedKmh: decimal(source.VectorSpeed),
      odometerKm: decimal(source.Odometer),
      fuelL: decimal(source.FuelConsumption),
    });
  }

  return snapshots;
}

export interface LiveTruck {
  plate: string;
  latitude: number;
  longitude: number;
  country: string | null;
  moving: boolean;
  /** „Važiuoja 81 km/h“, „Stovi, variklis įjungtas“, „Stovi“ arba „Nėra ryšio“. */
  state: string;
  gpsTime: string;
}

/** Po kiek minučių tylos paskutinis greitis nebelaikomas dabartiniu. */
export const SIGNAL_STALE_MINUTES = 30;

/** Minutės tarp dviejų tiekėjo laikų („2026-09-22 19:06:51“, ta pati zona). */
function minutesBetween(earlier: string, later: string): number {
  const at = (value: string) => Date.parse(`${value.replace(" ", "T")}Z`);
  return (at(later) - at(earlier)) / 60_000;
}

/**
 * Furų sąrašo furos su paskutine žinoma vieta – po vieną eilutę furai.
 *
 * `now` – dabartinis laikas tiekėjo zona (Lietuvos). Senas signalas su greičiu
 * dar nereiškia, kad fura važiuoja: ji tiesiog nutilo važiuodama.
 *
 * Numeriai lyginami be tarpų, kaip ir kitur. Telematikoje būna ir priekabų bei
 * parduotų vilkikų, todėl rodomos tik sąrašo furos, o `withoutPosition` pasako,
 * kurių sąrašo furų žemėlapyje nėra – kad jos nedingtų tyliai.
 */
export function liveTrucks(
  snapshots: TelematicsSnapshot[],
  plates: string[],
  now: string,
): { trucks: LiveTruck[]; withoutPosition: string[] } {
  const key = (plate: string) => plate.replace(/\s+/g, "").toUpperCase();
  const newest = new Map<string, TelematicsSnapshot>();
  for (const row of snapshots) {
    if (row.latitude === null || row.longitude === null) continue;
    const seen = newest.get(key(row.plate));
    if (!seen || row.gpsTime > seen.gpsTime) newest.set(key(row.plate), row);
  }

  const trucks: LiveTruck[] = [];
  const withoutPosition: string[] = [];
  for (const plate of plates) {
    const row = newest.get(key(plate));
    if (!row || row.latitude === null || row.longitude === null) {
      withoutPosition.push(plate);
      continue;
    }
    const speed = Math.round(row.speedKmh ?? 0);
    const silent = !(minutesBetween(row.gpsTime, now) <= SIGNAL_STALE_MINUTES);
    const moving = !silent && row.ignition && speed > 0;
    trucks.push({
      plate,
      latitude: row.latitude,
      longitude: row.longitude,
      country: row.country,
      moving,
      state: silent
        ? "Nėra ryšio"
        : moving ? `Važiuoja ${speed} km/h` : row.ignition ? "Stovi, variklis įjungtas" : "Stovi",
      gpsTime: row.gpsTime,
    });
  }
  return { trucks, withoutPosition };
}
