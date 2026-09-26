import { describe, expect, it } from "vitest";

import { centsToCsv, csvField, csvFileName, CSV_COLUMNS, tripsToCsv } from "./trip-export";
import type { TripSummary } from "./trips";

function trip(overrides: Partial<TripSummary> = {}): TripSummary {
  return {
    id: "1",
    tripNumber: "R-001",
    origin: "Panevėžys",
    destination: "Oslas",
    tripDate: "2026-09-10",
    truckPlate: "LOV 141",
    paidKm: 2060,
    emptyKm: 0,
    emptyFuelCents: 0,
    revenueCents: 240000,
    totalCostCents: 182550,
    profitCents: 57450,
    marginPercent: 23.9375,
    profitPerKm: 0.2789,
    roadByCountry: [],
    ...overrides,
  };
}

describe("centsToCsv", () => {
  it("rašo su kableliu ir dviem skaitmenimis", () => {
    expect(centsToCsv(182550)).toBe("1825,50");
  });

  it("nulius po kablelio palieka", () => {
    expect(centsToCsv(240000)).toBe("2400,00");
  });

  it("smulkmeną rašo su nuliu priekyje", () => {
    expect(centsToCsv(5)).toBe("0,05");
  });

  it("neigiamą sumą rašo su minusu", () => {
    expect(centsToCsv(-7050)).toBe("-70,50");
  });
});

describe("csvField", () => {
  it("paprasto teksto nekeičia", () => {
    expect(csvField("Panevėžys")).toBe("Panevėžys");
  });

  it("kabliataškį turintį lauką ima į kabutes", () => {
    // Kitaip eilutė suskiltų į du stulpelius.
    expect(csvField("R-1; R-2")).toBe('"R-1; R-2"');
  });

  it("kabutes dvigubina", () => {
    expect(csvField('Reisas "skubus"')).toBe('"Reisas ""skubus"""');
  });

  it("eilutės lūžį ima į kabutes", () => {
    expect(csvField("Vilnius\nKaunas")).toBe('"Vilnius\nKaunas"');
  });
});

describe("tripsToCsv", () => {
  it("pirmoji eilutė yra antraštė", () => {
    expect(tripsToCsv([]).split("\r\n")[0]).toBe(CSV_COLUMNS.join(";"));
  });

  it("tuščias sąrašas duoda vien antraštę", () => {
    expect(tripsToCsv([]).split("\r\n")).toHaveLength(1);
  });

  it("reisą rašo visais stulpeliais", () => {
    const rows = tripsToCsv([trip()]).split("\r\n");

    expect(rows).toHaveLength(2);
    expect(rows[1]).toBe(
      "2026-09-10;R-001;LOV 141;Panevėžys;Oslas;2060;0;2400,00;1825,50;574,50;23,9;0,28",
    );
  });

  it("nesant maržos palieka tuščią langelį", () => {
    // Nulis reikštų „dirbo be pelno", o čia dydžio nėra.
    const rows = tripsToCsv([trip({ marginPercent: null, profitPerKm: null })]).split("\r\n");
    expect(rows[1].endsWith(";;")).toBe(true);
  });

  it("išlaiko sąrašo tvarką", () => {
    const rows = tripsToCsv([
      trip({ id: "1", tripNumber: "R-001" }),
      trip({ id: "2", tripNumber: "R-002" }),
    ]).split("\r\n");

    expect(rows[1]).toContain("R-001");
    expect(rows[2]).toContain("R-002");
  });
});

describe("csvFileName", () => {
  it("prideda datą", () => {
    expect(csvFileName("2026-09-25")).toBe("reisai-2026-09-25.csv");
  });
});
