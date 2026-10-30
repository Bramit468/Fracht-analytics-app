import { describe, expect, it } from "vitest";
import { idleCosts, idleDailyCents } from "./idle-costs";
import { spanDayKeys } from "./plan-actual";
import type { Truck } from "./calc";

describe("idleDailyCents", () => {
  it("counts fixed costs and trailer, not repairs or per diem", () => {
    const truck: Truck = {
      dailyCents: { depreciation: 3000, interest: 500, insuranceKasko: 400, insuranceCivil: 200, insuranceCmr: 100, driverSalary: 14000, perDiem: 6000, repairs: 2500, management: 1000 },
      trailerMonthlyCents: 60833,
      workingDaysPerMonth: 365 / 12,
    };
    expect(idleDailyCents(truck)).toBe(3000 + 500 + 400 + 200 + 100 + 14000 + 1000 + 2000);
  });
});

describe("idleCosts", () => {
  it("counts each truck's days without a trip, plates matched without spaces", () => {
    const days = spanDayKeys([
      { plate: "LOV141", from: "2026-10-01", to: "2026-10-03" },
      { plate: "LOV 141", from: "2026-10-03", to: "2026-10-04" },
    ]);
    const rows = idleCosts([{ plate: "LOV 141", dailyCents: 20_000 }, { plate: "NHT 384", dailyCents: 10_000 }, { plate: "MJI 014", dailyCents: 1 }], days, "2026-10-01", "2026-10-05");
    expect(rows).toEqual([
      { plate: "NHT 384", idleDays: 5, dailyCents: 10_000, costCents: 50_000 },
      { plate: "LOV 141", idleDays: 1, dailyCents: 20_000, costCents: 20_000 },
      { plate: "MJI 014", idleDays: 5, dailyCents: 1, costCents: 5 },
    ]);
    expect(idleCosts([{ plate: "LOV 141", dailyCents: 1 }], days, "2026-10-01", "2026-10-04")).toEqual([]);
  });
});
