import { describe, expect, it } from "vitest";
import type { Supply } from "./telematics-costs";
import { tollsByCountry } from "./toll-countries";

const supply = (date: string, kind: Supply["kind"], costCents: number, country: string | null, plate = "LOV 141"): Supply =>
  ({ plate, date, kind, costCents, quantity: null, country });

describe("tollsByCountry", () => {
  const supplies = [
    supply("2026-10-01", "toll", 10_000, "DEU"),
    supply("2026-10-02", "toll", 5_000, "DEU", "LOV141"),
    supply("2026-10-02", "toll", 25_000, "SWE"),
    supply("2026-10-03", "toll", 10_000, null, "NHT 384"),
    supply("2026-10-03", "diesel", 99_000, "DEU"),
    supply("2026-09-30", "toll", 99_000, "POL"),
  ];

  it("sums only tolls in the range, most expensive first, keeps unknown country", () => {
    expect(tollsByCountry(supplies, "2026-10-01", "2026-10-31")).toEqual([
      { country: "SWE", costCents: 25_000, payments: 1, sharePercent: 50 },
      { country: "DEU", costCents: 15_000, payments: 2, sharePercent: 30 },
      { country: null, costCents: 10_000, payments: 1, sharePercent: 20 },
    ]);
  });

  it("filters by plate ignoring spaces", () => {
    expect(tollsByCountry(supplies, "2026-10-01", "2026-10-31", "LOV141").map((row) => row.country)).toEqual(["SWE", "DEU"]);
    expect(tollsByCountry([], "2026-10-01", "2026-10-31")).toEqual([]);
  });
});
