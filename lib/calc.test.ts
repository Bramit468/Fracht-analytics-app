import { describe, expect, it } from "vitest";

import {
  calcAdblueCost,
  calcCostPerKm,
  calcDailyRate,
  calcFuelCost,
  calcMargin,
  calcProfit,
  calcProfitPerKm,
  calcRevenue,
  calcRoadCost,
  calcTotalCost,
  calcTrip,
  calcTruckCost,
  type CountryTariff,
  type TripInput,
  type Truck,
} from "./calc";

/**
 * Kontroliniai skaičiai paimti iš realaus įmonės Excel'io
 * (Omniva, Klaipėda-Kaunas-Klaipėda). Jei šie testai nustoja praeiti,
 * vadinasi skaičiavimas pakeistas neteisingai.
 *
 * Žr. docs/skaiciavimo-modelis.md
 */

const OMNIVA_TRUCK: Truck = {
  dailyCents: {
    depreciation: 5700,
    interest: 0,
    insuranceKasko: 400,
    insuranceCivil: 800,
    insuranceCmr: 200,
    driverSalary: 14500,
    perDiem: 0,
    repairs: 2800,
    management: 0,
  },
  trailerMonthlyCents: 55000,
  workingDaysPerMonth: 22,
};

const TARIFFS: CountryTariff[] = [
  { country: "Vokietija", rate: 0.348, rateType: "per_km" },
  { country: "Lenkija", rate: 0.35, rateType: "per_km" },
  { country: "Čekija", rate: 0.22, rateType: "per_km" },
  { country: "Austrija", rate: 0.5317, rateType: "per_km" },
  { country: "Švedija", rate: 4.2, rateType: "flat" },
];

const OMNIVA_TRIP: TripInput = {
  truck: OMNIVA_TRUCK,
  days: 22,
  paidKm: 11050,
  emptyKm: 200,
  fuel: { litresPer100Km: 26, pricePerLitre: 1.24 },
  adblue: { litresPer100Km: 2.4, pricePerLitre: 0.765 },
  legs: [{ country: "Vokietija", km: 0 }],
  extras: { bridgesCents: 36000, ferriesCents: 0, tunnelsCents: 0, parkingCents: 0 },
  revenue: { mode: "per_km", ratePerKm: 1.09 },
  tariffs: TARIFFS,
};

describe("calcDailyRate", () => {
  it("sudeda paros dedamąsias ir priekabą iš mėnesinės nuomos", () => {
    // 57 + 4 + 8 + 2 + 145 + 28 + (550 / 22 = 25) = 269 EUR
    expect(calcDailyRate(OMNIVA_TRUCK)).toBe(26900);
  });

  it("meta klaidą, kai darbo dienų skaičius netinkamas", () => {
    expect(() => calcDailyRate({ ...OMNIVA_TRUCK, workingDaysPerMonth: 0 })).toThrow();
  });
});

describe("calcTruckCost", () => {
  it("daugina paros kainą iš dienų", () => {
    expect(calcTruckCost(OMNIVA_TRUCK, 22)).toBe(591800); // 5918 EUR
  });
});

describe("calcFuelCost / calcAdblueCost", () => {
  it("skaičiuoja kurą nuo viso kilometražo", () => {
    expect(
      calcFuelCost({ totalKm: 11250, litresPer100Km: 26, pricePerLitre: 1.24 }),
    ).toBe(362700); // 3627.00 EUR
  });

  it("skaičiuoja AdBlue nuo viso kilometražo", () => {
    expect(
      calcAdblueCost({ totalKm: 11250, litresPer100Km: 2.4, pricePerLitre: 0.765 }),
    ).toBe(20655); // 206.55 EUR
  });

  it("nulis kilometrų duoda nulį", () => {
    expect(calcFuelCost({ totalKm: 0, litresPer100Km: 26, pricePerLitre: 1.24 })).toBe(0);
  });
});

describe("calcRoadCost", () => {
  const noExtras = {
    bridgesCents: 0,
    ferriesCents: 0,
    tunnelsCents: 0,
    parkingCents: 0,
  };

  it("sudeda atkarpas ir atskirus mokesčius", () => {
    expect(
      calcRoadCost([{ country: "Vokietija", km: 0 }], TARIFFS, {
        ...noExtras,
        bridgesCents: 36000,
      }),
    ).toBe(36000);
  });

  it("daugina iš km, kai įkainis yra už kilometrą", () => {
    expect(calcRoadCost([{ country: "Vokietija", km: 100 }], TARIFFS, noExtras)).toBe(3480);
  });

  it("ima fiksuotą mokestį neatsižvelgiant į km", () => {
    expect(calcRoadCost([{ country: "Švedija", km: 500 }], TARIFFS, noExtras)).toBe(420);
  });

  it("nepraleidžia nė vienos atkarpos ir nė vieno mokesčio", () => {
    // Regresijos testas. Excel'io formulė praleisdavo penktą atkarpą ir
    // parkingą, todėl kaštai būdavo per maži, o pelnas per didelis.
    const cost = calcRoadCost(
      [
        { country: "Vokietija", km: 100 }, // 34.80
        { country: "Lenkija", km: 200 }, // 70.00
        { country: "Čekija", km: 300 }, // 66.00
        { country: "Austrija", km: 400 }, // 212.68
        { country: "Švedija", km: 500 }, // 4.20 fiksuotas
      ],
      TARIFFS,
      {
        bridgesCents: 1000,
        ferriesCents: 2000,
        tunnelsCents: 3000,
        parkingCents: 4000,
      },
    );
    expect(cost).toBe(38768 + 10000);
  });

  it("meta klaidą, kai šalies nėra žinyne", () => {
    expect(() => calcRoadCost([{ country: "Mordoras", km: 10 }], TARIFFS, noExtras)).toThrow(
      /Mordoras/,
    );
  });
});

describe("calcTotalCost", () => {
  it("sudeda visas dedamąsias", () => {
    expect(
      calcTotalCost({
        roadCents: 36000,
        fuelCents: 362700,
        adblueCents: 20655,
        truckCents: 591800,
      }),
    ).toBe(1011155); // 10 111.55 EUR
  });
});

describe("calcRevenue", () => {
  it("skaičiuoja pagal km įkainį tik nuo apmokamų km", () => {
    expect(calcRevenue({ mode: "per_km", ratePerKm: 1.09 }, 11050)).toBe(1204450);
  });

  it("ima frachto kainą, kai pasirinktas frachtas", () => {
    expect(calcRevenue({ mode: "freight", freightPriceCents: 240000 }, 11050)).toBe(240000);
  });
});

describe("calcProfit", () => {
  it("skaičiuoja pelną", () => {
    expect(calcProfit(1204450, 1011155)).toBe(193295); // 1932.95 EUR
  });

  it("nuostolį grąžina kaip neigiamą skaičių, ne nulį", () => {
    const loss = calcProfit(100000, 107000);
    expect(loss).toBe(-7000);
    expect(typeof loss).toBe("number");
  });
});

describe("calcMargin", () => {
  it("skaičiuoja maržą procentais", () => {
    expect(calcMargin(193295, 1204450)).toBeCloseTo(16.05, 2);
  });

  it("grąžina null, kai pajamų nėra", () => {
    expect(calcMargin(-1011155, 0)).toBeNull();
  });
});

describe("calcCostPerKm / calcProfitPerKm", () => {
  it("dalina iš apmokamų km", () => {
    expect(calcCostPerKm(1011155, 11050)).toBeCloseTo(0.9151, 4);
    expect(calcProfitPerKm(193295, 11050)).toBeCloseTo(0.1749, 4);
  });

  it("grąžina null, kai apmokamų km nėra", () => {
    expect(calcCostPerKm(1011155, 0)).toBeNull();
    expect(calcProfitPerKm(193295, 0)).toBeNull();
  });
});

describe("calcTrip (visas Omniva reisas)", () => {
  const result = calcTrip(OMNIVA_TRIP);

  it("atkartoja Excel'io skaičius", () => {
    expect(result.totalKm).toBe(11250);
    expect(result.fuelCents).toBe(362700);
    expect(result.adblueCents).toBe(20655);
    expect(result.roadCents).toBe(36000);
    expect(result.truckCents).toBe(591800);
    expect(result.totalCostCents).toBe(1011155);
    expect(result.revenueCents).toBe(1204450);
    expect(result.profitCents).toBe(193295);
    expect(result.marginPercent).toBeCloseTo(16.05, 2);
    expect(result.costPerKm).toBeCloseTo(0.9151, 4);
    expect(result.profitPerKm).toBeCloseTo(0.1749, 4);
  });

  it("detalizacija sutampa su bendra suma", () => {
    expect(result.fuelCents + result.adblueCents + result.roadCents + result.truckCents).toBe(
      result.totalCostCents,
    );
  });

  it("nuostolingą reisą parodo kaip nuostolį", () => {
    const loss = calcTrip({
      ...OMNIVA_TRIP,
      revenue: { mode: "freight", freightPriceCents: 900000 },
    });
    expect(loss.profitCents).toBe(900000 - 1011155);
    expect(loss.profitCents).toBeLessThan(0);
    expect(loss.marginPercent).toBeLessThan(0);
  });
});
