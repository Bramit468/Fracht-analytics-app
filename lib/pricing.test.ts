import { describe, expect, it } from "vitest";

import { calcTrip } from "./calc";
import { marginForPrice, priceForMargin, priceForProfit, pricePerKm } from "./pricing";

describe("priceForMargin", () => {
  it("marža skaičiuojama nuo pajamų, ne nuo kaštų", () => {
    // 800 € kaštų su 20 % marža yra 1000 €, o ne 960 €. Supainiojus su
    // antkainiu, kiekvienas pasiūlymas būtų per pigus, ir to nesimatytų —
    // pelnas juk vis tiek teigiamas.
    expect(priceForMargin(80000, 20)).toBe(100000);
  });

  it("nulinė marža yra kaštų kaina", () => {
    expect(priceForMargin(80000, 0)).toBe(80000);
  });

  it("neigiama marža reiškia vežimą į nuostolį", () => {
    // Pasitaiko sąmoningai: grįžtamasis reisas tuščias arba pigus.
    expect(priceForMargin(100000, -10)).toBe(90909);
  });

  it("šimtaprocentinė marža neįmanoma", () => {
    // Reikštų pajamas be kaštų. Grąžinti begalybę arba didelį skaičių būtų
    // blogiau nei pasakyti, kad atsakymo nėra.
    expect(priceForMargin(80000, 100)).toBeNull();
    expect(priceForMargin(80000, 150)).toBeNull();
  });

  it("be kaštų kainos nesiūlo", () => {
    expect(priceForMargin(0, 20)).toBeNull();
  });
});

describe("priceForProfit", () => {
  it("prideda norimą pelną prie kaštų", () => {
    expect(priceForProfit(80000, 20000)).toBe(100000);
  });
});

describe("marginForPrice", () => {
  it("grąžina maržą procentais", () => {
    expect(marginForPrice(80000, 100000)).toBeCloseTo(20, 10);
  });

  it("nuostolinga kaina duoda neigiamą maržą", () => {
    expect(marginForPrice(100000, 80000)).toBeCloseTo(-25, 10);
  });

  it("be pajamų maržos nėra", () => {
    // Nulis reikštų „dirbam be pelno", o čia tiesiog nėra iš ko skaičiuoti.
    expect(marginForPrice(80000, 0)).toBeNull();
  });
});

describe("pricePerKm", () => {
  it("kainą paverčia įkainiu už km", () => {
    expect(pricePerKm(100000, 1000)).toBeCloseTo(1, 10);
  });

  it("be kilometrų įkainio nėra", () => {
    expect(pricePerKm(100000, 0)).toBeNull();
  });
});

describe("kaina be pajamų", () => {
  it("kaina prašyti imama iš kaštų, kai pajamų dar nėra", () => {
    // Greita kaina: pajamų laukas tuščias, reisas skaičiuojamas su 0 €. Kaštai
    // nuo pajamų nepriklauso, todėl iš jų išeina ta pati kaina kaip iš žinomų
    // kaštų, o marža be pajamų – „nėra", ne nulis.
    const truck = {
      dailyCents: {
        depreciation: 5700, interest: 0, insuranceKasko: 400, insuranceCivil: 800, insuranceCmr: 200,
        driverSalary: 14500, perDiem: 0, repairs: 2800, management: 0,
      },
      trailerMonthlyCents: 0,
      workingDaysPerMonth: 22,
    }; // 244 € per parą, be priekabos nuomos
    const trip = calcTrip({
      truck,
      days: 2,
      paidKm: 1000,
      emptyKm: 0,
      fuel: { litresPer100Km: 30, pricePerLitre: 1.5 },
      adblue: { litresPer100Km: 2, pricePerLitre: 0.7 },
      extras: { bridgesCents: 0, ferriesCents: 0, tunnelsCents: 0, parkingCents: 0 },
      legs: [{ country: "Nemokami", km: 1000 }],
      tariffs: [{ country: "Nemokami", rate: 0, rateType: "per_km" }],
      revenue: { mode: "freight", freightPriceCents: 0 },
    });

    expect(trip.revenueCents).toBe(0);
    expect(trip.marginPercent).toBeNull();
    // 2 paros 488 € + kuras 450 € + AdBlue 14 € = 952 €; 952 / 0,8 = 1190 €.
    expect(trip.totalCostCents).toBe(95200);
    expect(priceForMargin(trip.totalCostCents, 20)).toBe(119000);
  });
});
