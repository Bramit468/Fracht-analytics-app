/**
 * Tarpiniai maršruto taškai (#85).
 *
 * PTV parenka kelią pagal savo taisykles, o vežėjas kartais žino daugiau: kad
 * ties tuo tiltu remontas, kad ten nepravažiuoti su priekaba, kad klientas
 * prašo užsukti. Užuot braižius netikrą liniją, pridedamas tarpinis taškas, ir
 * PTV perskaičiuoja viską iš naujo — kilometrus, laiką ir mokesčius.
 *
 * Patikrinta su tikru raktu: Panevėžys–Varšuva be tarpinio yra 518 km ir
 * 37,56 € kelių, o per Balstogę — 564 km ir 31,20 €. Ilgesnis kelias pasirodė
 * pigesnis, ir be šitos galimybės to nesimatytų.
 */

import type { LineCoordinate } from "./route-line";

export interface ViaPoint {
  latitude: number;
  longitude: number;
  /**
   * Tarp kurių sustojimų taškas guli: 0 – tarp pirmo ir antro, 1 – tarp antro ir
   * trečio. Be šito PTV tarpinius taškus paimtų ne tarp tų sustojimų, kuriems jie
   * skirti. Nenurodžius – pirmas ruožas.
   */
  leg?: number;
}

/** Daugiau taškų reiškia ne tikslesnį maršrutą, o ilgesnę užklausą. */
export const MAX_VIA_POINTS = 5;

/** Arčiau nei šitiek laipsnių esantys taškai laikomi tuo pačiu (apie 1 km). */
const SAME_POINT_DEGREES = 0.01;

export type ViaChange =
  | { ok: true; points: ViaPoint[] }
  | { ok: false; message: string; points: ViaPoint[] };

function samePlace(a: ViaPoint, b: ViaPoint): boolean {
  return (
    Math.abs(a.latitude - b.latitude) < SAME_POINT_DEGREES &&
    Math.abs(a.longitude - b.longitude) < SAME_POINT_DEGREES
  );
}

/** Atstumo kvadratas laipsniais. Rikiavimui to užtenka, o šaknis nieko nekeičia. */
function squaredDistance(point: ViaPoint, coordinate: LineCoordinate): number {
  const dx = point.longitude - coordinate[0];
  const dy = point.latitude - coordinate[1];
  return dx * dx + dy * dy;
}

/** Kelintas linijos taškas arčiausiai. */
export function nearestLineIndex(line: LineCoordinate[], point: ViaPoint): number {
  let best = 0;
  let bestDistance = Infinity;

  for (const [index, coordinate] of line.entries()) {
    const distance = squaredDistance(point, coordinate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }

  return best;
}

/**
 * Taškai išrikiuojami pagal maršrutą, o ne pagal paspaudimų eilę.
 *
 * Be to, pridėjus antrą tašką arčiau pradžios nei pirmasis, PTV būtų verčiamas
 * grįžti atgal: maršrutas eitų per juos ta tvarka, kuria juos surašėme.
 */
export function orderViaPoints(points: ViaPoint[], line: LineCoordinate[]): ViaPoint[] {
  if (points.length < 2 || line.length < 2) return points;

  return [...points]
    .map((point) => ({ point, index: nearestLineIndex(line, point) }))
    .sort((a, b) => (a.point.leg ?? 0) - (b.point.leg ?? 0) || a.index - b.index)
    .map((row) => row.point);
}

/**
 * Kuriame ruože (tarp kurių sustojimų) yra taškas.
 *
 * `stopPoints` – visi sustojimai maršruto tvarka. Ruožas = kiek tarpinių
 * sustojimų taškas jau praėjo linijoje.
 */
export function legIndex(line: LineCoordinate[], stopPoints: ViaPoint[], point: ViaPoint): number {
  if (line.length < 2 || stopPoints.length < 3) return 0;

  const at = nearestLineIndex(line, point);
  let leg = 0;
  for (const stop of stopPoints.slice(1, -1)) {
    if (nearestLineIndex(line, stop) <= at) leg += 1;
  }
  return leg;
}

/**
 * Tempiant liniją perbraižomas tik tas ruožas, kuriame laikomasi: nuo
 * ankstesnio iki kito maršruto taško. `waypointIndices` – taškų vietos linijoje.
 * Grąžinami linijos indeksai [nuo, iki].
 */
export function anchorsAround(lineLength: number, waypointIndices: number[], at: number): [number, number] {
  let from = 0;
  let to = lineLength - 1;
  for (const index of waypointIndices) {
    if (index <= at) from = Math.max(from, index);
    else to = Math.min(to, index);
  }
  return [from, to];
}

export function addViaPoint(points: ViaPoint[], point: ViaPoint): ViaChange {
  if (points.length >= MAX_VIA_POINTS) {
    return {
      ok: false,
      message: `Daugiausia ${MAX_VIA_POINTS} tarpiniai taškai.`,
      points,
    };
  }

  if (points.some((existing) => samePlace(existing, point))) {
    return { ok: false, message: "Toks tarpinis taškas jau yra.", points };
  }

  return { ok: true, points: [...points, point] };
}

export function moveViaPoint(points: ViaPoint[], index: number, point: ViaPoint): ViaPoint[] {
  if (index < 0 || index >= points.length) return points;
  return points.map((existing, position) => (position === index ? point : existing));
}

export function removeViaPoint(points: ViaPoint[], index: number): ViaPoint[] {
  return points.filter((_, position) => position !== index);
}

/** „55.7333,24.3500" – tokia forma taškai keliauja į PTV ir į paslėptą lauką. */
export function formatViaPoint(point: ViaPoint): string {
  return `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;
}

/** Iš teksto atgal. Netvarkingos reikšmės praleidžiamos, o ne verčia klaidą. */
export function parseViaPoints(value: string): ViaPoint[] {
  return value
    .split(";")
    .flatMap((part) => {
      const [latitude, longitude] = part.split(",").map(Number);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
      return [{ latitude, longitude }];
    })
    .slice(0, MAX_VIA_POINTS);
}
