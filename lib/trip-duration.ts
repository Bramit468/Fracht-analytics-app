/**
 * Apytikslė reiso trukmė pagal ES vairuotojų taisykles.
 *
 * Grynas skaičiavimas be UI. Prielaidos (greitis, km per parą, poilsio trukmės)
 * gyvena `trip-duration-config.ts`.
 *
 * Modelis: kiekviena vairavimo para – tiek km, kiek telpa į `maxDayKm`, plius
 * pertraukos; tarp parų – 11 val. poilsis. Po 6 vairavimo parų vietoj paros
 * poilsio ateina savaitinis (24 arba 45 val.). Su išvykimo data savaitinis
 * poilsis dar ir pritaikomas savaitgaliui.
 */

import {
  TRIP_DURATION as C,
  type SpeedProfile,
  type WeeklyRest,
} from "./trip-duration-config";

const HOUR_MS = 3_600_000;
const EPS = 1e-9;
const WEEK_HOURS = 168;

export interface DurationPlan {
  drivingHours: number;
  drivingDays: number;
  breaks: number;
  dailyRests: number;
  weeklyRests: number;
  weeklyRestRequired: boolean;
  weeklyRestHours: number;
  /** Nuo išvykimo iki atvykimo, su pertraukomis ir poilsiu. */
  elapsedHours: number;
  /** Tik su išvykimo data, `YYYY-MM-DDTHH:MM` (be laiko juostos). */
  arrival: string | null;
  /** Kiek kalendorinių parų reisas paliečia. */
  calendarDays: number;
  /** Tik su išvykimo data: reisas kerta šeštadienį ar sekmadienį. */
  spansWeekend: boolean;
  /** Kiek km galima nuvažiuoti iki pirmo savaitinio poilsio. */
  kmBeforeWeeklyRest: number;
  /** Kiek km per 168 val., kai kartojasi 6 vairavimo parų + savaitinio poilsio ciklas. */
  kmPerWeek: number;
}

export interface DurationEstimate {
  best: DurationPlan;
  realistic: DurationPlan;
}

/** Nepasiekiamas arba netinkamas laikas laikomas nenurodytu. */
function parseDeparture(departure?: string): number | null {
  // V8 `Date.parse` priima ir šiukšles, todėl formatas tikrinamas atskirai.
  if (!departure || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(departure)) return null;
  const ms = Date.parse(`${departure}:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

function isWeekend(ms: number): boolean {
  const day = new Date(ms).getUTCDay();
  return day === 0 || day === 6;
}

/** Vienos paros vairavimas ir pertraukos. */
function drivingDay(km: number, profile: SpeedProfile) {
  const hours = km / profile.speedKmh;
  const breaks = hours > C.breakAfterDrivingHours ? Math.ceil(hours / C.breakAfterDrivingHours) - 1 : 0;
  return { hours, breaks, workHours: hours + (breaks * C.breakMinutes) / 60 };
}

function spansWeekendBetween(start: number, end: number): boolean {
  const dayMs = 24 * HOUR_MS;
  for (let day = Math.floor(start / dayMs) * dayMs; day <= end; day += dayMs) {
    if (isWeekend(day)) return true;
  }
  return false;
}

function simulate(km: number, profile: SpeedProfile, weeklyRestHours: number, start: number | null) {
  let t = start ?? 0;
  let left = km;
  let driven = 0;
  let drivingHours = 0;
  let breaks = 0;
  let dailyRests = 0;
  let weeklyRests = 0;
  let days = 0;
  let sinceWeekly = 0;
  let kmBeforeWeeklyRest: number | null = null;

  while (left > EPS) {
    const dayKm = Math.min(left, profile.maxDayKm);
    const day = drivingDay(dayKm, profile);
    const dayStart = t;

    t += day.workHours * HOUR_MS;
    left -= dayKm;
    driven += dayKm;
    drivingHours += day.hours;
    breaks += day.breaks;
    days += 1;
    sinceWeekly += 1;

    if (left <= EPS) break;

    // Savaitgalis: kita para prasidėtų šeštadienį ar sekmadienį, o ši prasidėjo
    // darbo dieną. Savaitgalį išvykusį vairuotoją nestabdome – jo poilsio dar nebuvo.
    const nextStart = t + C.dailyRestHours * HOUR_MS;
    const weekend = start !== null && C.restOnWeekend && isWeekend(nextStart) && !isWeekend(dayStart);

    if (sinceWeekly >= C.maxDrivingDaysPerWeek || weekend) {
      t += weeklyRestHours * HOUR_MS;
      weeklyRests += 1;
      sinceWeekly = 0;
      kmBeforeWeeklyRest ??= driven;
    } else {
      t += C.dailyRestHours * HOUR_MS;
      dailyRests += 1;
    }
  }

  return { t, drivingHours, breaks, dailyRests, weeklyRests, days, kmBeforeWeeklyRest };
}

/** Pilnas ciklas: 6 vairavimo paros, 5 paros poilsiai ir savaitinis poilsis. */
function weeklyKm(profile: SpeedProfile, weeklyRestHours: number): number {
  const days = C.maxDrivingDaysPerWeek;
  const cycleHours =
    days * drivingDay(profile.maxDayKm, profile).workHours +
    (days - 1) * C.dailyRestHours +
    weeklyRestHours;
  return Math.round((days * profile.maxDayKm * WEEK_HOURS) / cycleHours);
}

export function planTrip(
  km: number,
  profile: SpeedProfile,
  weeklyRest: WeeklyRest,
  departure?: string,
): DurationPlan {
  const weeklyRestHours = C.weeklyRestHours[weeklyRest];
  const start = parseDeparture(departure);
  // Dalijimas iš nulio ir neigiami km: nėra ką planuoti.
  const safeKm = Number.isFinite(km) && km > 0 ? km : 0;

  const run = simulate(safeKm, profile, weeklyRestHours, start);
  const elapsedHours = start === null ? run.t / HOUR_MS : (run.t - start) / HOUR_MS;

  // Pirmo savaitinio poilsio riba nepriklauso nuo reiso ilgio: skaičiuojama
  // tarsi reisas būtų pakankamai ilgas, kad poilsis įvyktų.
  const capacity = simulate(profile.maxDayKm * (C.maxDrivingDaysPerWeek + 1), profile, weeklyRestHours, start);

  const dayMs = 24 * HOUR_MS;
  const calendarDays = start === null
    ? Math.max(1, Math.ceil(elapsedHours / 24))
    : Math.floor(run.t / dayMs) - Math.floor(start / dayMs) + 1;

  return {
    drivingHours: run.drivingHours,
    drivingDays: run.days,
    breaks: run.breaks,
    dailyRests: run.dailyRests,
    weeklyRests: run.weeklyRests,
    weeklyRestRequired: run.weeklyRests > 0,
    weeklyRestHours,
    elapsedHours,
    arrival: start === null ? null : new Date(run.t).toISOString().slice(0, 16),
    calendarDays,
    spansWeekend: start !== null && spansWeekendBetween(start, run.t),
    kmBeforeWeeklyRest: capacity.kmBeforeWeeklyRest ?? profile.maxDayKm * C.maxDrivingDaysPerWeek,
    kmPerWeek: weeklyKm(profile, weeklyRestHours),
  };
}

/** Geriausias atvejis ir realistiškas rėžis vienu kvietimu. */
export function estimateTripDuration(
  km: number,
  weeklyRest: WeeklyRest = C.defaultWeeklyRest,
  departure?: string,
): DurationEstimate {
  return {
    best: planTrip(km, C.best, weeklyRest, departure),
    realistic: planTrip(km, C.realistic, weeklyRest, departure),
  };
}
