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

    snapshots.push({
      objectId,
      plate: normalizePlate(plate),
      gpsTime,
      country: text(source.Country),
      ignition: text(source.Ignition) === "1",
      odometerKm: decimal(source.Odometer),
      fuelL: decimal(source.FuelConsumption),
    });
  }

  return snapshots;
}
