import { describe, expect, it } from "vitest";

import {
  countriesToCsv,
  monthsToCsv,
  reportFileName,
  routesToCsv,
  trucksToCsv,
} from "./report-export";

const PROFIT = {
  tripCount: 3,
  paidKm: 2060.4,
  revenueCents: 240000,
  totalCostCents: 182550,
  profitCents: 57450,
  marginPercent: 23.9375,
  costPerKm: 0.8861,
  profitPerKm: 0.2789,
};

describe("trucksToCsv", () => {
  it("rašo antraštę ir eilutę", () => {
    const rows = trucksToCsv([{ plate: "LOV 141", ...PROFIT }]).split("\r\n");

    expect(rows[0]).toBe(
      "Fura;Reisai;Apmokami km;Pajamos, EUR;Kaštai, EUR;Pelnas, EUR;Marža, %;Savikaina, EUR/km;Pelnas, EUR/km",
    );
    expect(rows[1]).toBe("LOV 141;3;2060;2400,00;1825,50;574,50;23,9;0,89;0,28");
  });

  it("tuščia lentelė duoda vien antraštę", () => {
    expect(trucksToCsv([]).split("\r\n")).toHaveLength(1);
  });
});

describe("routesToCsv", () => {
  it("kryptį rašo dviem stulpeliais", () => {
    const rows = routesToCsv([
      { origin: "Panevėžys", destination: "Oslas", ...PROFIT },
    ]).split("\r\n");

    expect(rows[1].startsWith("Panevėžys;Oslas;3;")).toBe(true);
  });

  it("kabliataškį pavadinime ima į kabutes", () => {
    // Kitaip eilutė suskiltų į papildomą stulpelį.
    const rows = routesToCsv([
      { origin: "Vilnius; Kaunas", destination: "Oslas", ...PROFIT },
    ]).split("\r\n");

    expect(rows[1].startsWith('"Vilnius; Kaunas";Oslas;')).toBe(true);
  });
});

describe("countriesToCsv", () => {
  it("centus už km paverčia eurais", () => {
    // Lentelėje rodoma 0,12 €/km, todėl faile turi būti tas pats skaičius.
    const rows = countriesToCsv([
      { country: "Lenkija", km: 800, costCents: 9600, tripCount: 2, costShare: 71.6, centsPerKm: 12 },
    ]).split("\r\n");

    expect(rows[1]).toBe("Lenkija;2;800;96,00;71,6;0,12");
  });

  it("nesant dalies palieka tuščią langelį", () => {
    const rows = countriesToCsv([
      { country: "Nemokami", km: 100, costCents: 0, tripCount: 1, costShare: null, centsPerKm: null },
    ]).split("\r\n");

    expect(rows[1].endsWith(";;")).toBe(true);
  });
});

describe("monthsToCsv", () => {
  it("rašo mėnesio eilutę", () => {
    const rows = monthsToCsv([
      {
        month: "2026-09",
        tripCount: 2,
        paidKm: 2000,
        revenueCents: 500000,
        totalCostCents: 390000,
        profitCents: 110000,
        marginPercent: 22,
        costPerKm: 1.95,
      },
    ]).split("\r\n");

    expect(rows[1]).toBe("2026-09;2;2000;5000,00;3900,00;1100,00;22,0;1,95");
  });

  it("tuščią mėnesį palieka eilutėje", () => {
    const rows = monthsToCsv([
      {
        month: "2026-08",
        tripCount: 0,
        paidKm: 0,
        revenueCents: 0,
        totalCostCents: 0,
        profitCents: 0,
        marginPercent: null,
        costPerKm: null,
      },
    ]).split("\r\n");

    expect(rows[1]).toBe("2026-08;0;0;0,00;0,00;0,00;;");
  });
});

describe("reportFileName", () => {
  it("prideda pjūvį ir datą", () => {
    expect(reportFileName("furos", "2026-09-26")).toBe("furos-2026-09-26.csv");
  });
});
