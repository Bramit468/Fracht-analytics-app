/**
 * Adresų paieška per Photon (#68).
 *
 * PTV paieška hierarchinė: šalis -> apskritis -> miestas -> gatvė. Todėl
 * „klaipėdos g." jam reiškia Klaipėdos apskritį, o ne Klaipėdos gatvę, ir
 * vartotojui siūlomos vietovės iš G raidės.
 *
 * Photon remiasi OpenStreetMap ir tą pačią užklausą supranta taip, kaip žmogus:
 * grąžina Klaipėdos gatves Pagėgiuose, Stoniškiuose, Rukuose.
 *
 * Maršrutas ir kelių mokesčiai lieka PTV — ten jis nepakeičiamas. Keičiama tik
 * ta dalis, kurios jis nemoka.
 */

import { countryLt } from "./countries-lt";

export const PHOTON_URL = "https://photon.komoot.io/api/";

export interface PhotonPlace {
  /** Ką matys vartotojas: gatvė su numeriu arba vietovės pavadinimas. */
  label: string;
  /** Miestas, pašto kodas, šalis — kad dešimt Klaipėdos gatvių būtų atskiriamos. */
  sublabel: string;
  latitude: number;
  longitude: number;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function decimal(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * GeoJSON atsakymas į pasirinkimo sąrašą.
 *
 * Koordinatės GeoJSON'e eina **ilguma, platuma** — tokia tvarka. Sukeitus
 * vietomis fura atsidurtų kitame pasaulio krašte, o skaičius atrodytų tvarkingas.
 */
export function parsePhotonPlaces(payload: unknown, limit = 8): PhotonPlace[] {
  if (typeof payload !== "object" || payload === null) return [];
  const features = (payload as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];

  const places: PhotonPlace[] = [];
  const seen = new Set<string>();

  for (const feature of features) {
    if (typeof feature !== "object" || feature === null) continue;
    const row = feature as Record<string, unknown>;

    const geometry = row.geometry as Record<string, unknown> | undefined;
    const coordinates = geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
    const longitude = decimal(coordinates[0]);
    const latitude = decimal(coordinates[1]);
    if (latitude === null || longitude === null) continue;

    const props = (row.properties ?? {}) as Record<string, unknown>;
    const street = text(props.street) ?? text(props.name);
    const house = text(props.housenumber);
    if (street === null) continue;

    const label = house === null ? street : `${street} ${house}`;
    const sublabel = [
      text(props.city) ?? text(props.county),
      text(props.postcode),
      // Šalis lietuviškai, o gatvė ir miestas – vietine kalba: vairuotojas
      // Lenkijoje ieško „Warszawa", ir taip pat rašoma važtaraštyje.
      countryLt(text(props.countrycode), text(props.country)),
    ]
      .filter(Boolean)
      .join(", ");

    // OSM tą pačią gatvę dažnai turi keliais įrašais; sąraše jie neatskiriami.
    const key = `${label}|${sublabel}`;
    if (seen.has(key)) continue;
    seen.add(key);

    places.push({ label, sublabel, latitude, longitude });
    if (places.length >= limit) break;
  }

  return places;
}

/** Pilnas adresas vienoje eilutėje — toks įrašomas į reiso laukelį. */
export function placeLabel(place: PhotonPlace): string {
  return place.sublabel ? `${place.label}, ${place.sublabel}` : place.label;
}
