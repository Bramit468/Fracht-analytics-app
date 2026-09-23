/**
 * Maršruto linija žemėlapiui (#74).
 *
 * PTV grąžina liniją kaip GeoJSON tekstą — Panevėžys–Oslas yra apie 418 KB
 * koordinačių. Į naršyklę tiek siųsti neverta: ekrane, kur visas maršrutas
 * telpa į kelis šimtus taškų pločio langą, skirtumo nesimato.
 *
 * Todėl taškai retinami. Pradžia ir pabaiga visada išlaikomos — kitaip linija
 * nustotų siekti pakrovimo ar iškrovimo vietos.
 */

/** [ilguma, platuma] — tokia tvarka, kaip GeoJSON. */
export type LineCoordinate = [number, number];

/** Kiek taškų užtenka, kad linija ekrane atrodytų glotni. */
export const TASKU_RIBA = 400;

function coordinate(value: unknown): LineCoordinate | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = value[0];
  const latitude = value[1];
  if (typeof longitude !== "number" || typeof latitude !== "number") return null;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return [longitude, latitude];
}

/**
 * PTV `polyline` tekstą paverčia koordinačių sąrašu.
 *
 * Laukas ateina **tekstu su JSON viduje**, o ne objektu — tai lengva
 * pražiūrėti, nes atsakymas ir taip yra JSON.
 */
export function parseRouteLine(polyline: unknown): LineCoordinate[] {
  if (typeof polyline !== "string" || polyline === "") return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(polyline);
  } catch {
    return [];
  }

  if (typeof parsed !== "object" || parsed === null) return [];
  const raw = (parsed as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(raw)) return [];

  const points: LineCoordinate[] = [];
  for (const value of raw) {
    const point = coordinate(value);
    if (point !== null) points.push(point);
  }
  return points;
}

/**
 * Palieka ne daugiau kaip `limit` taškų, imdama kas n-tąjį.
 *
 * Pradžia ir pabaiga išlaikomos visada: be jų linija nutrūktų prieš pasiekiant
 * adresą, ir atrodytų, kad maršrutas skaičiuotas ne ten.
 */
export function thinRouteLine(points: LineCoordinate[], limit = TASKU_RIBA): LineCoordinate[] {
  if (points.length <= limit || limit < 2) return points;

  const step = Math.ceil(points.length / (limit - 1));
  const thinned: LineCoordinate[] = [];

  for (let i = 0; i < points.length; i += step) {
    thinned.push(points[i]);
  }

  const last = points[points.length - 1];
  const kept = thinned[thinned.length - 1];
  if (kept[0] !== last[0] || kept[1] !== last[1]) thinned.push(last);

  return thinned;
}

/** Kraštinės, kad žemėlapis iškart parodytų visą maršrutą. */
export function routeBounds(points: LineCoordinate[]): [LineCoordinate, LineCoordinate] | null {
  if (points.length === 0) return null;

  let minLon = points[0][0];
  let maxLon = points[0][0];
  let minLat = points[0][1];
  let maxLat = points[0][1];

  for (const [lon, lat] of points) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  return [[minLon, minLat], [maxLon, maxLat]];
}
