import { describe, expect, it } from "vitest";

import { legCostCents, summarizeCountryRoads, tripRoadsByCountry } from "./country-roads";
import type { CountryTariff } from "./calc";

const TARIFFS: CountryTariff[] = [
  { country: "Lenkija", rate: 0.12, rateType: "per_km" },
  { country: "Vokietija", rate: 0.19, rateType: "per_km" },
  { country: "Austrija", rate: 45, rateType: "flat" },
  { country: "Nemokami", rate: 0, rateType: "per_km" },
];

describe("legCostCents", () => {
  const byCountry = new Map(TARIFFS.map((tariff) => [tariff.country, tariff]));

  it("skaičiuoja įkainį už kilometrą", () => {
    expect(legCostCents({ country: "Lenkija", km: 300 }, byCountry)).toBe(3600);
  });

  it("fiksuotą įkainį ima kaip yra", () => {
    // Vinjetė nepriklauso nuo nuvažiuotų kilometrų.
    expect(legCostCents({ country: "Austrija", km: 120 }, byCountry)).toBe(4500);
  });

  it("nežinomos šalies nelaiko nuliu", () => {
    expect(legCostCents({ country: "Marsas", km: 100 }, byCountry)).toBeNull();
  });
});

describe("tripRoadsByCountry", () => {
  it("paverčia atkarpas kainomis", () => {
    const roads = tripRoadsByCountry(
      [
        { country: "Lenkija", km: 300 },
        { country: "Vokietija", km: 200 },
      ],
      TARIFFS,
    );

    expect(roads).toEqual([
      { country: "Lenkija", km: 300, costCents: 3600 },
      { country: "Vokietija", km: 200, costCents: 3800 },
    ]);
  });

  it("nemokamą atkarpą palieka su nuliu", () => {
    expect(tripRoadsByCountry([{ country: "Nemokami", km: 500 }], TARIFFS)).toEqual([
      { country: "Nemokami", km: 500, costCents: 0 },
    ]);
  });
});

describe("summarizeCountryRoads", () => {
  const trips = [
    {
      roadByCountry: [
        { country: "Lenkija", km: 300, costCents: 3600 },
        { country: "Vokietija", km: 200, costCents: 3800 },
      ],
    },
    {
      roadByCountry: [
        { country: "Lenkija", km: 500, costCents: 6000 },
        { country: "Nemokami", km: 100, costCents: 0 },
      ],
    },
  ];

  it("brangiausią šalį rodo viršuje", () => {
    expect(summarizeCountryRoads(trips).map((row) => row.country)).toEqual([
      "Lenkija",
      "Vokietija",
      "Nemokami",
    ]);
  });

  it("sudeda kilometrus ir kaštus", () => {
    const lenkija = summarizeCountryRoads(trips)[0];

    expect(lenkija).toMatchObject({ km: 800, costCents: 9600, tripCount: 2 });
  });

  it("skaičiuoja dalį nuo visų kelių kaštų", () => {
    const lenkija = summarizeCountryRoads(trips)[0];
    expect(lenkija.costShare).toBeCloseTo((9600 / 13400) * 100, 6);
  });

  it("tą pačią šalį dviejose atkarpose skaičiuoja kaip vieną reisą", () => {
    // Kitaip „per kiek reisų važiuota per Lenkiją" būtų per didelis.
    const dviAtkarpos = [
      {
        roadByCountry: [
          { country: "Lenkija", km: 100, costCents: 1200 },
          { country: "Lenkija", km: 200, costCents: 2400 },
        ],
      },
    ];

    expect(summarizeCountryRoads(dviAtkarpos)[0]).toMatchObject({
      tripCount: 1,
      km: 300,
      costCents: 3600,
    });
  });

  it("rodo vidutinę kainą už kilometrą", () => {
    const vokietija = summarizeCountryRoads(trips)[1];
    expect(vokietija.centsPerKm).toBeCloseTo(19, 6);
  });

  it("be kaštų dalies nerodo", () => {
    const nemokami = summarizeCountryRoads([
      { roadByCountry: [{ country: "Nemokami", km: 100, costCents: 0 }] },
    ]);

    expect(nemokami[0].costShare).toBeNull();
  });

  it("tuščias sąrašas duoda tuščią rezultatą", () => {
    expect(summarizeCountryRoads([])).toEqual([]);
  });
});
