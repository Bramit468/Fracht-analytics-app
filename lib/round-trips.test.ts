import { describe, expect, it } from "vitest";

import { baseOrigin, roundTrips } from "./round-trips";
import type { TripSummary } from "./trips";

function trip(tripNumber: string, tripDate: string, origin: string, profitCents: number, days = 2): TripSummary {
  return {
    id: tripNumber, tripNumber, origin, destination: "X", tripDate, truckPlate: "MHE 763",
    paidKm: 436, days, emptyKm: 0, emptyFuelCents: 0, revenueCents: 120000, totalCostCents: 120000 - profitCents, profitCents,
    marginPercent: null, profitPerKm: null, profitPerDayCents: null, roadByCountry: [],
  };
}

const J = "Jönköping, SWE";

describe("baseOrigin", () => {
  it("dažniausia pakrovimo vieta, jei bent 3 reisai", () => {
    expect(baseOrigin([trip("a", "2026-10-01", J, 0), trip("b", "2026-10-02", J, 0), trip("c", "2026-10-03", "Langhus, NOR", 0), trip("d", "2026-10-04", J, 0)])).toBe(J);
    expect(baseOrigin([trip("a", "2026-10-01", J, 0), trip("b", "2026-10-02", J, 0)])).toBeNull();
  });
});

describe("roundTrips", () => {
  it("atgalinis krovinys + kitas bazės krovinys = viena kelionė (MHE 763, 2026-10)", () => {
    const [truck] = roundTrips([
      trip("104-15298451", "2026-10-15", J, -15294),
      // Atgalinis krovinys Norvegija → Švedija: tuščią grįžimą „neša“ jis.
      trip("32 pallets", "2026-10-19", "Langhus, NOR", -47468, 1.08),
      trip("104-15298955", "2026-10-20", J, 67261, 1),
      trip("104-15299406", "2026-10-21", J, 21603, 1.958),
      trip("4551283595", "2026-11-04", "Vestby, NOR", -17331, 1),
    ]);
    expect(truck.base).toBe(J);
    expect(truck.rounds.map((item) => [item.trips.map((t) => t.tripNumber), item.profitCents, item.complete])).toEqual([
      [["104-15298451"], -15294, true],
      [["32 pallets", "104-15298955"], 19793, true],
      [["104-15299406"], 21603, true],
      // Laikotarpio gale – grįžimas dar be bazės krovinio.
      [["4551283595"], -17331, false],
    ]);
    // Vidurkiai – tik užbaigtų: (−152,94 + 197,93 + 216,03) / 3.
    expect(truck.averageProfitCents).toBe(Math.round((-15294 + 19793 + 21603) / 3));
    expect(truck.rounds[1].days).toBe(2.08);
  });

  it("fura be nuolatinės krypties praleidžiama", () => {
    expect(roundTrips([trip("a", "2026-10-01", J, 0), trip("b", "2026-10-05", "Kaunas, LTU", 0)])).toEqual([]);
  });
});
