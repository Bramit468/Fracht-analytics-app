import { describe, expect, it } from "vitest";

import { estimateScandlinesFreightFare, isRostockGedser } from "./ferry-pricing";

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
    expect(estimateScandlinesFreightFare(["Rostock - Gedser"], 17, "loaded")).toEqual({
      route: "Rostock–Gedser",
      billedMetres: 17,
      load: "loaded",
      baseCents: 23620,
      surchargeCents: 10404,
      totalCents: 34024,
    });
  });

  it("tuščiam junginiui naudoja tuščio bazinį tarifą", () => {
    expect(
      estimateScandlinesFreightFare(["Gedser - Rostock"], 17, "empty")?.totalCents,
    ).toBe(23924);
  });

  it("ilgį apvalina iki kito pradėto metro", () => {
    expect(
      estimateScandlinesFreightFare(["Rostock - Gedser"], 16.01, "loaded")?.billedMetres,
    ).toBe(17);
  });

  it("nespėja tarifo už viešos lentelės ribų", () => {
    expect(estimateScandlinesFreightFare(["Rostock - Gedser"], 9, "loaded")).toBeNull();
    expect(estimateScandlinesFreightFare(["Rostock - Gedser"], 27, "loaded")).toBeNull();
  });
});
