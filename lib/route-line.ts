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

/**
 * Kelio ruožai, kuriais važiuoja abi linijos. 60 m – kad priešingos greitkelio
 * juostos (tuščia fura atvažiuoja, pakrauta išvažiuoja) būtų tas pats kelias:
 * su 30 m jos trūkinėjo ir linija buvo sukarpyta (2026-11-04, A2 ties Poznane).
 */
export const SHARED_TOLERANCE_M = 60;
/** Trumpesni tarpai tarp bendrų ruožų (mazgai, nuovažos) užpildomi – vienas ruožas. */
const SHARED_GAP_M = 2000;
/** Toliau nei tiek – jau kitas kelias: iš ten sprendžiama, kurioje pusėje raudona. */
const APPROACH_M = 300;

export interface SharedRun {
  coordinates: LineCoordinate[];
  /** Kurioje pusėje (žiūrint `line` kryptimi) `line` pusė: 1 – dešinėje, -1 – kairėje (`line-offset`). */
  side: 1 | -1;
}

/**
 * Linijos `line` ruožai, einantys tuo pačiu keliu kaip `other`.
 *
 * Žemėlapiui: kur tuščias ir krovinio kelias sutampa, linija perskeliama per
 * pusę – abi spalvos greta. Pusė parenkama ta, iš kurios `line` atvažiuoja
 * (arba, jei ji kelyje prasideda, į kurią nuvažiuoja), kad raudona nekirstų
 * juodos – ir viena visam ruožui, kad nešokinėtų.
 */
export function sharedRuns(
  line: LineCoordinate[],
  other: LineCoordinate[],
  tolerance = SHARED_TOLERANCE_M,
): SharedRun[] {
  if (line.length < 2 || other.length < 2) return [];
  const scale = Math.cos((line[0][1] * Math.PI) / 180) * METRES_PER_DEGREE;
  const toXY = ([lon, lat]: LineCoordinate) => [lon * scale, lat * METRES_PER_DEGREE] as const;
  const reach = APPROACH_M;
  const segments = other.slice(1).map((end, index) => {
    const [ax, ay] = toXY(other[index]);
    const [bx, by] = toXY(end);
    return { ax, ay, bx, by, minX: Math.min(ax, bx) - reach, maxX: Math.max(ax, bx) + reach, minY: Math.min(ay, by) - reach, maxY: Math.max(ay, by) + reach };
  });

  // Atstumas iki `other`, bet ne daugiau nei `reach` (toliau – nesvarbu kiek).
  const distance = (point: LineCoordinate): number => {
    const [px, py] = toXY(point);
    let best = Infinity;
    for (const s of segments) {
      if (px < s.minX || px > s.maxX || py < s.minY || py > s.maxY) continue;
      const dx = s.bx - s.ax;
      const dy = s.by - s.ay;
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / lengthSq));
      best = Math.min(best, Math.hypot(px - (s.ax + t * dx), py - (s.ay + t * dy)));
      if (best <= tolerance) break;
    }
    return best;
  };
  const metres = (a: LineCoordinate, b: LineCoordinate) => {
    const [ax, ay] = toXY(a);
    const [bx, by] = toXY(b);
    return Math.hypot(bx - ax, by - ay);
  };

  const gaps = line.map(distance);
  const near = gaps.map((gap) => gap <= tolerance);

  // Bendri ruožai (bent dvi gretimos artimos viršūnės), tada trumpi tarpai užpildomi.
  const runs: [number, number][] = [];
  let start = -1;
  for (let i = 1; i < line.length; i++) {
    if (near[i - 1] && near[i]) {
      if (start < 0) start = i - 1;
    } else if (start >= 0) {
      runs.push([start, i - 1]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, line.length - 1]);
  const merged: [number, number][] = [];
  for (const run of runs) {
    const previous = merged[merged.length - 1];
    if (previous) {
      let gap = 0;
      for (let i = previous[1]; i < run[0]; i++) gap += metres(line[i], line[i + 1]);
      if (gap <= SHARED_GAP_M) {
        previous[1] = run[1];
        continue;
      }
    }
    merged.push([...run]);
  }

  const crossSide = (a: LineCoordinate, b: LineCoordinate, p: LineCoordinate): 1 | -1 => {
    const [ax, ay] = toXY(a);
    const [bx, by] = toXY(b);
    const [px, py] = toXY(p);
    // Kryžminė sandauga > 0 – taškas kairėje.
    return (bx - ax) * (py - ay) - (by - ay) * (px - ax) > 0 ? -1 : 1;
  };

  return merged.map(([from, to]): SharedRun => {
    let side: 1 | -1 = 1;
    let before = -1;
    for (let i = from - 1; i >= 0; i--) if (gaps[i] > APPROACH_M) { before = i; break; }
    if (before >= 0) {
      side = crossSide(line[from], line[from + 1], line[before]);
    } else {
      let after = -1;
      for (let i = to + 1; i < line.length; i++) if (gaps[i] > APPROACH_M) { after = i; break; }
      if (after >= 0) side = crossSide(line[to - 1], line[to], line[after]);
    }
    return { coordinates: line.slice(from, to + 1), side };
  });
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
