import { describe, expect, it } from "vitest";

import {
  routeSchedule,
  scenarioPreset,
  scheduleDays,
  scheduleRequestBody,
} from "./ptv-schedule";

const FROM = { latitude: 55.7333, longitude: 24.35 };
const TO = { latitude: 59.9139, longitude: 10.7522 };

/** Tikras PTV atsakymas, Panevėžys–Oslas, išvykstant 2026-09-28 06:00. */
const PAYLOAD = {
  distance: 2053939,
  scheduleReport: {
    drivingTime: 100655,
    serviceTime: 0,
    waitingTime: 8156,
    breakTime: 8100,
    restTime: 118800,
    startTime: "2026-09-28T06:00:00Z",
    endTime: "2026-09-30T23:28:31Z",
  },
  events: [
    {
      latitude: 55.73,
      longitude: 24.35,
      distanceFromStart: 0,
      countryCode: "LT",
      startsAt: "2026-09-28T06:00:00Z",
      schedule: { duration: 0, scheduleTypes: ["SERVICE"] },
    },
    {
      latitude: 53.56,
      longitude: 22.26,
      distanceFromStart: 316587,
      countryCode: "PL",
      startsAt: "2026-09-28T10:30:00Z",
      schedule: { duration: 2700, scheduleTypes: ["BREAK"] },
    },
    {
      latitude: 51.96,
      longitude: 19.85,
      distanceFromStart: 619000,
      countryCode: "PL",
      startsAt: "2026-09-28T15:45:00Z",
      schedule: { duration: 39600, scheduleTypes: ["DAILY_REST"] },
    },
  ],
};

describe("scenarioPreset", () => {
  it("parenka PTV presetą", () => {
    expect(scenarioPreset("team")).toBe("EU_DRIVING_TIME_REGULATION_FOR_TEAM_AND_MULTIPLE_DAYS");
  });
});

describe("scheduleRequestBody", () => {
  it("taškus deda į kūną, ne į adresą", () => {
    // GET sintaksė čia atmetama: tvarkaraštis veikia tik per POST.
    const body = scheduleRequestBody(FROM, TO, "multipleDays", "2026-09-28T06:00:00Z");

    expect(body.waypoints).toEqual([
      { offRoad: { latitude: 55.7333, longitude: 24.35 } },
      { offRoad: { latitude: 59.9139, longitude: 10.7522 } },
    ]);
  });

  it("pailsėjusiam vairuotojui knygelės nesiunčia", () => {
    const body = scheduleRequestBody(FROM, TO, "multipleDays", "2026-09-28T06:00:00Z", 0);
    expect(body.driver).toEqual({
      workingHoursPreset: "EU_DRIVING_TIME_REGULATION_FOR_MULTIPLE_DAYS",
    });
  });

  it("jau vairavusiam perduoda sukauptą laiką sekundėmis", () => {
    const body = scheduleRequestBody(FROM, TO, "multipleDays", "2026-09-28T06:00:00Z", 3);
    const driver = body.driver as Record<string, Record<string, unknown>>;

    expect(driver.workLogbook.accumulatedDrivingTimeSinceLastBreak).toBe(10800);
    expect(driver.workLogbook.lastTimeTheDriverWorked).toBe("2026-09-28T06:00:00Z");
  });
});

describe("scheduleDays", () => {
  it("skaičiuoja kalendorines paras imtinai", () => {
    // Fura kainuoja nuo prasidėjusios paros, ne nuo 24 valandų atkarpos.
    expect(scheduleDays("2026-09-28T06:00:00Z", "2026-09-30T23:28:31Z")).toBe(3);
  });

  it("tą pačią dieną baigtas reisas yra viena para", () => {
    expect(scheduleDays("2026-09-28T06:00:00Z", "2026-09-28T19:00:00Z")).toBe(1);
  });

  it("peršoka mėnesio ribą", () => {
    expect(scheduleDays("2026-09-30T06:00:00Z", "2026-10-02T08:00:00Z")).toBe(3);
  });

  it("netvarkingo laiko nepaverčia nuliu", () => {
    expect(scheduleDays("ne data", "taip pat ne")).toBe(1);
  });
});

describe("routeSchedule", () => {
  it("perskaito vairavimą, pertraukas ir poilsį minutėmis", () => {
    expect(routeSchedule(PAYLOAD)).toMatchObject({
      drivingMinutes: 1678,
      breakMinutes: 135,
      restMinutes: 1980,
      waitingMinutes: 136,
    });
  });

  it("atvykimas yra teisėtas, su poilsiu", () => {
    const schedule = routeSchedule(PAYLOAD);

    expect(schedule?.endTime).toBe("2026-09-30T23:28:31Z");
    expect(schedule?.days).toBe(3);
  });

  it("surenka pertraukas ir poilsius", () => {
    const stops = routeSchedule(PAYLOAD)?.stops ?? [];

    expect(stops).toHaveLength(2);
    expect(stops[0]).toMatchObject({ type: "BREAK", minutes: 45, countryCode: "PL", distanceKm: 317 });
    expect(stops[1]).toMatchObject({ type: "DAILY_REST", minutes: 660 });
  });

  it("pakrovimo nelaiko poilsiu", () => {
    // `SERVICE` yra pakrovimas, o ne vairuotojo pertrauka.
    expect(routeSchedule(PAYLOAD)?.stops.some((stop) => stop.minutes === 0)).toBe(false);
  });

  it("be ataskaitos grąžina null", () => {
    expect(routeSchedule({ distance: 100 })).toBeNull();
    expect(routeSchedule(null)).toBeNull();
  });
});
