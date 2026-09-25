/**
 * Vairuotojo pertraukos ir teisėtas atvykimas (#87).
 *
 * Iki šiol reiso trukmė buvo spėjimas: kelio valandos, padalintos iš devynių.
 * Bet para furos savikainos yra apie 58 % reiso kaštų, todėl klaida parose yra
 * klaida pelne, ir ji nematoma — skaičius atrodo tvarkingas.
 *
 * PTV moka suplanuoti reisą pagal ES 561/2006: kada privaloma 45 min. pertrauka,
 * kada 11 val. poilsis, ir kada vilkikas realiai atvyks.
 *
 * Patikrinta su tikru raktu, Panevėžys–Oslas, išvykstant 2026-09-28 06:00:
 *   grynas vairavimas   27 val. 58 min.
 *   pertraukos           2 val. 15 min.
 *   poilsis             33 val.
 *   atvykimas           2026-09-30 23:28  ->  3 paros
 * Senasis spėjimas (27,9 / 9) davė 4 paras, t. y. vieną parą per daug.
 *
 * Tvarkaraštis prieinamas tik per POST: GET užklausa atmeta `SCHEDULE_REPORT`
 * su `ROUTING_PARAMETER_ONLY_SUPPORTED_BY_POST`.
 */

export const PTV_SCHEDULE_RESULTS = "SCHEDULE_EVENTS,SCHEDULE_REPORT";

/** Scenarijai, kuriuos žmogus renkasi formoje. PTV presetų daugiau, bet vežėjui užtenka šitų. */
export const DRIVER_SCENARIOS = [
  {
    key: "multipleDays",
    label: "Kelių parų reisas",
    preset: "EU_DRIVING_TIME_REGULATION_FOR_MULTIPLE_DAYS",
  },
  {
    key: "singleDay",
    label: "Vienos dienos reisas",
    preset: "EU_DRIVING_TIME_REGULATION_FOR_SINGLE_DAY",
  },
  {
    key: "team",
    label: "Du vairuotojai",
    preset: "EU_DRIVING_TIME_REGULATION_FOR_TEAM_AND_MULTIPLE_DAYS",
  },
] as const;

export type DriverScenario = (typeof DRIVER_SCENARIOS)[number]["key"];

export function scenarioPreset(scenario: DriverScenario): string {
  return (
    DRIVER_SCENARIOS.find((row) => row.key === scenario) ?? DRIVER_SCENARIOS[0]
  ).preset;
}

export interface SchedulePoint {
  latitude: number;
  longitude: number;
}

/**
 * POST kūnas.
 *
 * Taškai eina kūne (`offRoad`), o ne užklausos eilutėje — GET sintaksė čia
 * atmetama. `workLogbook` pridedamas tik tada, kai vairuotojas jau vairavo:
 * be jo PTV skaičiuoja nuo pailsėjusio vairuotojo.
 */
export function scheduleRequestBody(
  from: SchedulePoint,
  to: SchedulePoint,
  scenario: DriverScenario,
  startTime: string,
  alreadyDrivenHours = 0,
): Record<string, unknown> {
  const driver: Record<string, unknown> = { workingHoursPreset: scenarioPreset(scenario) };

  if (alreadyDrivenHours > 0) {
    const seconds = Math.round(alreadyDrivenHours * 3600);
    driver.workLogbook = {
      lastTimeTheDriverWorked: startTime,
      // Nuo paskutinės pertraukos ir nuo paskutinio poilsio – tas pats laikas:
      // tiksliau pasakyti galėtų tik tachografas, o jo čia nesaugome.
      accumulatedDrivingTimeSinceLastBreak: seconds,
      accumulatedDrivingTimeSinceLastDailyRest: seconds,
    };
  }

  return {
    waypoints: [
      { offRoad: { latitude: from.latitude, longitude: from.longitude } },
      { offRoad: { latitude: to.latitude, longitude: to.longitude } },
    ],
    driver,
  };
}

export type ScheduleStopType = "BREAK" | "DAILY_REST" | "WEEKLY_REST" | "WAIT" | "OTHER";

export interface ScheduleStop {
  type: ScheduleStopType;
  startsAt: string;
  minutes: number;
  countryCode: string;
  distanceKm: number;
}

export interface RouteSchedule {
  drivingMinutes: number;
  breakMinutes: number;
  restMinutes: number;
  waitingMinutes: number;
  startTime: string;
  /** Teisėtas atvykimas: su pertraukomis ir poilsiu. */
  endTime: string;
  /** Kiek parų apims reisas. Tiek, kiek kalendorinių dienų jis paliečia. */
  days: number;
  stops: ScheduleStop[];
}

function decimal(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function minutes(seconds: unknown): number {
  return Math.round((decimal(seconds) ?? 0) / 60);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Kiek parų apima reisas.
 *
 * Skaičiuojamos kalendorinės dienos, o ne 24 valandų atkarpos: fura kainuoja
 * nuo tos akimirkos, kai prasidėjo para, lygiai taip pat kaip vykstančio reiso
 * skaičiavime. Išvykus 06:00 ir atvykus po dviejų nakvynių, tai trys paros, o
 * ne dvi su trupučiu.
 */
export function scheduleDays(startTime: string, endTime: string): number {
  const start = Date.parse(startTime.slice(0, 10));
  const end = Date.parse(endTime.slice(0, 10));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 1;

  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

function stopType(types: unknown): ScheduleStopType | null {
  if (!Array.isArray(types)) return null;
  const names = types.filter((item): item is string => typeof item === "string");

  if (names.includes("BREAK")) return "BREAK";
  if (names.includes("DAILY_REST")) return "DAILY_REST";
  if (names.includes("WEEKLY_REST")) return "WEEKLY_REST";
  if (names.includes("WAIT")) return "WAIT";
  // `SERVICE` yra pakrovimas ir iškrovimas – ne vairuotojo poilsis.
  return null;
}

/** PTV atsakymas į tvarkaraštį. `null`, kai ataskaitos nėra. */
export function routeSchedule(payload: unknown): RouteSchedule | null {
  if (typeof payload !== "object" || payload === null) return null;

  const source = payload as Record<string, unknown>;
  const report = source.scheduleReport;
  if (typeof report !== "object" || report === null) return null;

  const row = report as Record<string, unknown>;
  const startTime = text(row.startTime);
  const endTime = text(row.endTime);
  if (startTime === "" || endTime === "") return null;

  const stops: ScheduleStop[] = [];
  for (const event of Array.isArray(source.events) ? source.events : []) {
    if (typeof event !== "object" || event === null) continue;
    const entry = event as Record<string, unknown>;
    const schedule = entry.schedule as Record<string, unknown> | undefined;
    const type = stopType(schedule?.scheduleTypes);
    const duration = minutes(schedule?.duration);
    if (type === null || duration <= 0) continue;

    stops.push({
      type,
      startsAt: text(entry.startsAt),
      minutes: duration,
      countryCode: text(entry.countryCode),
      distanceKm: Math.round((decimal(entry.distanceFromStart) ?? 0) / 1000),
    });
  }

  return {
    drivingMinutes: minutes(row.drivingTime),
    breakMinutes: minutes(row.breakTime),
    restMinutes: minutes(row.restTime),
    waitingMinutes: minutes(row.waitingTime),
    startTime,
    endTime,
    days: scheduleDays(startTime, endTime),
    stops,
  };
}
