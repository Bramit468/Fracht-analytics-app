/**
 * Maršruto linija žemėlapiui (#74).
 *
 * PTV grąžina liniją kaip GeoJSON tekstą — Panevėžys–Oslas yra apie 418 KB
 * koordinačių. Siunčiama ne visa, bet ir ne retinta „kas n-tas“: žr.
 * `simplifyRouteLine`.
 */

/** [ilguma, platuma] — tokia tvarka, kaip GeoJSON. */
export type LineCoordinate = [number, number];

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

/** 5 ženklai po kablelio yra ~1 m: ekrane to neįmanoma pastebėti. */
const COORDINATE_DECIMALS = 5;
/** Kiek metrų linija gali nukrypti nuo PTV geometrijos. Kelio posūkių tai nepaliečia. */
export const SIMPLIFY_TOLERANCE_M = 3;

const METRES_PER_DEGREE = 111_320;

function round(value: number): number {
  const factor = 10 ** COORDINATE_DECIMALS;
  return Math.round(value * factor) / factor;
}

/**
 * Linija be tiesioginių atkarpų tarp retų taškų.
 *
 * Anksčiau imtas kas n-tas taškas (iki 400): Panevėžys–Oslas iš 15 009 taškų
 * virto 396, ir linija nukrypdavo nuo kelio iki 2 km. Douglas–Peucker išmeta tik
 * tuos taškus, kurie yra ne toliau kaip `tolerance` metrų nuo tiesės, tad
 * posūkiai išlieka, o ištiesinti ruožai pigiai nusiunčiami.
 *
 * Pradžia ir pabaiga išlaikomos visada: kitaip linija nutrūktų prieš adresą.
 */
export function simplifyRouteLine(
  points: LineCoordinate[],
  tolerance = SIMPLIFY_TOLERANCE_M,
): LineCoordinate[] {
  const rounded = points.map(([lon, lat]): LineCoordinate => [round(lon), round(lat)]);
  if (rounded.length < 3) return rounded;

  // Plokščia projekcija: iki kelių tūkstančių km maršruto metrų paklaidai to užtenka.
  const scale = Math.cos((rounded[0][1] * Math.PI) / 180);
  const x = rounded.map(([lon]) => lon * scale * METRES_PER_DEGREE);
  const y = rounded.map(([, lat]) => lat * METRES_PER_DEGREE);

  const keep = new Uint8Array(rounded.length);
  keep[0] = 1;
  keep[rounded.length - 1] = 1;

  // Be rekursijos: 15 000 taškų ilgame tiesiame kelyje neturi išnaudoti steko.
  const stack: [number, number][] = [[0, rounded.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop()!;
    const dx = x[to] - x[from];
    const dy = y[to] - y[from];
    const length = Math.hypot(dx, dy);

    let farthest = -1;
    let farthestDistance = tolerance;
    for (let i = from + 1; i < to; i++) {
      const distance = length === 0
        ? Math.hypot(x[i] - x[from], y[i] - y[from])
        : Math.abs(dy * (x[i] - x[from]) - dx * (y[i] - y[from])) / length;
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthest = i;
      }
    }

    if (farthest !== -1) {
      keep[farthest] = 1;
      stack.push([from, farthest], [farthest, to]);
    }
  }

  return rounded.filter((_, index) => keep[index] === 1);
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
