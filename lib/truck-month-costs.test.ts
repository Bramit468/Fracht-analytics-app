import { describe, expect, it } from "vitest";

import { daysInMonth, monthCostTotal, parseMonth, parseMonthCosts } from "./truck-month-costs";

describe("parseMonth", () => {
  it("tinkamas mėnuo – jo pirma diena", () => {
    expect(parseMonth("2026-10", "2026-11-19")).toBe("2026-10-01");
  });

  it("tuščias ar netinkamas – praėjęs mėnuo, ir per metų ribą", () => {
    expect(parseMonth(undefined, "2026-11-19")).toBe("2026-10-01");
    expect(parseMonth("2026-13", "2026-11-19")).toBe("2026-10-01");
    expect(parseMonth(undefined, "2027-01-05")).toBe("2026-12-01");
  });
});

describe("daysInMonth", () => {
  it("vasaris, keliamieji metai, 31 d.", () => {
    expect(daysInMonth("2026-02-01")).toBe(28);
    expect(daysInMonth("2028-02-01")).toBe(29);
    expect(daysInMonth("2026-10-01")).toBe(31);
  });
});

describe("parseMonthCosts", () => {
  it("užpildyti laukai – centais, tušti – 0; visi tušti – trinama", () => {
    const parsed = parseMonthCosts({ a: { driver_cents: "3 200,50", leasing_cents: "1500" }, b: {} }, ["a", "b"], "2026-10-01");
    expect(parsed.cleared).toEqual(["b"]);
    expect(parsed.errors).toEqual({});
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ truck_id: "a", month: "2026-10-01", driver_cents: 320050, leasing_cents: 150000, other_cents: 0 });
    expect(monthCostTotal(parsed.rows[0])).toBe(470050);
  });

  it("neteisinga suma – klaida, eilutė neįrašoma", () => {
    const parsed = parseMonthCosts({ a: { driver_cents: "12,345" } }, ["a"], "2026-10-01");
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors.a?.driver_cents).toBeTruthy();
  });
});
