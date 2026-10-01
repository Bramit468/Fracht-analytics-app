import { describe, expect, it } from "vitest";

import { estimateTripDuration, planTrip } from "./trip-duration";
import { TRIP_DURATION as C } from "./trip-duration-config";

const best = (km: number, rest: "reduced" | "regular" = "regular", departure?: string) =>
  planTrip(km, C.best, rest, departure);

describe("planTrip be išvykimo datos", () => {
  it("560 km: viena para, 8 val. vairavimo, viena pertrauka, jokio poilsio", () => {
    const plan = best(560);
    expect(plan.drivingDays).toBe(1);
    expect(plan.drivingHours).toBe(8);
    expect(plan.breaks).toBe(1);
    expect(plan.dailyRests).toBe(0);
    expect(plan.weeklyRestRequired).toBe(false);
    expect(plan.elapsedHours).toBe(8.75);
  });

  it("1200 km: trys paros ir du paros poilsiai", () => {
    const plan = best(1200);
    expect(plan.drivingDays).toBe(3);
    expect(plan.dailyRests).toBe(2);
    expect(plan.weeklyRests).toBe(0);
    expect(plan.elapsedHours).toBeCloseTo(8.75 * 2 + 11 * 2 + 80 / 70, 6);
  });

  it("2500 km: penkios paros, savaitinio poilsio dar nereikia", () => {
    const plan = best(2500);
    expect(plan.drivingDays).toBe(5);
    expect(plan.dailyRests).toBe(4);
    expect(plan.weeklyRestRequired).toBe(false);
  });

  it("4000 km: po 6 parų savaitinis poilsis, 24 val. trumpesnis už 45 val. per 21 val.", () => {
    const regular = best(4000, "regular");
    const reduced = best(4000, "reduced");
    expect(regular.drivingDays).toBe(8);
    expect(regular.weeklyRests).toBe(1);
    expect(regular.dailyRests).toBe(6);
    expect(regular.elapsedHours - reduced.elapsedHours).toBeCloseTo(21, 6);
  });

  it("nulis, neigiami ir NaN km nesukelia klaidos", () => {
    for (const km of [0, -5, Number.NaN]) {
      const plan = best(km);
      expect(plan.drivingDays).toBe(0);
      expect(plan.elapsedHours).toBe(0);
    }
  });
});

describe("planTrip su išvykimo data", () => {
  // 2026-10-01 yra ketvirtadienis.
  const thursday = "2026-10-01T06:00";

  it("2500 km iš ketvirtadienio kerta savaitgalį ir sustoja savaitiniam poilsiui", () => {
    const regular = best(2500, "regular", thursday);
    const reduced = best(2500, "reduced", thursday);

    expect(regular.spansWeekend).toBe(true);
    expect(regular.weeklyRests).toBe(1);
    expect(regular.weeklyRestRequired).toBe(true);
    // Iki savaitgalio telpa trys vairavimo paros.
    expect(regular.kmBeforeWeeklyRest).toBe(1680);

    expect(regular.elapsedHours - reduced.elapsedHours).toBeCloseTo(21, 6);
    expect(reduced.arrival).not.toBeNull();
    expect(Date.parse(`${regular.arrival}:00Z`) - Date.parse(`${reduced.arrival}:00Z`)).toBe(21 * 3_600_000);
  });

  it("560 km penktadienį: viena para, poilsio nėra", () => {
    const plan = best(560, "regular", "2026-10-02T06:00");
    expect(plan.weeklyRests).toBe(0);
    expect(plan.arrival).toBe("2026-10-02T14:45");
    expect(plan.calendarDays).toBe(1);
  });

  it("išvykus šeštadienį savaitgalio poilsis neįterpiamas", () => {
    const plan = best(1200, "regular", "2026-10-03T06:00");
    expect(plan.weeklyRests).toBe(0);
  });

  it("netinkama data ignoruojama", () => {
    expect(best(1200, "regular", "ne data").arrival).toBeNull();
  });
});

describe("kmPerWeek", () => {
  it("sutrumpintas poilsis leidžia nuvažiuoti daugiau per savaitę", () => {
    const regular = best(1000, "regular").kmPerWeek;
    const reduced = best(1000, "reduced").kmPerWeek;
    expect(regular).toBe(3702);
    expect(reduced).toBe(4293);
  });
});

describe("estimateTripDuration", () => {
  it("realistiškas rėžis ilgesnis už geriausią atvejį", () => {
    const { best: b, realistic } = estimateTripDuration(1500);
    expect(realistic.drivingDays).toBeGreaterThan(b.drivingDays);
    expect(realistic.elapsedHours).toBeGreaterThan(b.elapsedHours);
  });
});
