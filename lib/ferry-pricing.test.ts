import { describe, expect, it } from "vitest";

import { estimateScandlinesFreightFare, isRostockGedser, surchargeFor } from "./ferry-pricing";

describe("isRostockGedser", () => {
  it("atpažįsta abi kelto kryptis", () => {
    expect(isRostockGedser(["Rostock - Gedser"])).toBe(true);
    expect(isRostockGedser(["Gedser – Rostock"])).toBe(true);
  });

  it("nepriskiria kito kelto Scandlines tarifui", () => {
    expect(isRostockGedser(["Kiel - Klaipeda"])).toBe(false);
  });
});

describe("estimateScandlinesFreightFare", () => {
  it("prideda rugsėjo priemoką pakrautam 17 m junginiui", () => {
    expect(estimateScandlinesFreightFare(["Rostock - Gedser"], 17, "loaded", "2026-09-15")).toEqual({
      route: "Rostock–Gedser",
      billedMetres: 17,
      load: "loaded",
      baseCents: 23620,
      surchargeCents: 10404,
      totalCents: 34024,
      surcharge: { month: "2026-09", perMetreCents: 612, stale: false },
    });
  });

  it("ima reiso mėnesio priemoką", () => {
    expect(estimateScandlinesFreightFare(["Rostock - Gedser"], 17, "loaded", "2026-11-03")?.surchargeCents).toBe(17 * 700);
  });

  it("tuščiam junginiui naudoja tuščio bazinį tarifą", () => {
    expect(
      estimateScandlinesFreightFare(["Gedser - Rostock"], 17, "empty", "2026-09-01")?.totalCents,
    ).toBe(23924);
  });

  it("ilgį apvalina iki kito pradėto metro", () => {
    expect(
      estimateScandlinesFreightFare(["Rostock - Gedser"], 16.01, "loaded", "2026-10-01")?.billedMetres,
    ).toBe(17);
  });

  it("nespėja tarifo už viešos lentelės ribų", () => {
    expect(estimateScandlinesFreightFare(["Rostock - Gedser"], 9, "loaded", "2026-10-01")).toBeNull();
    expect(estimateScandlinesFreightFare(["Rostock - Gedser"], 27, "loaded", "2026-10-01")).toBeNull();
  });
});

describe("surchargeFor", () => {
  it("vėlesniam nei žinomas mėnesiui ima paskutinį ir pažymi, kad gali būti pasenęs", () => {
    expect(surchargeFor("2027-01-10")).toEqual({ month: "2026-11", perMetreCents: 700, stale: true });
  });

  it("ankstesniam nei žinomas – pirmą žinomą, be įspėjimo", () => {
    expect(surchargeFor("2026-03-01")).toMatchObject({ month: "2026-09", stale: false });
  });
});
