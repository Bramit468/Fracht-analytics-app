import { describe, expect, it } from "vitest";

import {
  calcAdblueCost,
  calcContribution,
  loadVerdict,
  calcCostPerKm,
  calcDailyRate,
  calcFuelCost,
  calcMargin,
  calcProfit,
  calcProfitPerDay,
  calcProfitPerKm,
  calcRevenue,
  calcRoadCost,
  calcTotalCost,
  calcTrip,
  calcTruckCost,
  DAYS_PER_MONTH,
  type CountryTariff,
  type TripInput,
  type Truck,
} from "./calc";
import { defaultEmptyKm, emptyKmTollCents } from "./quick-quote";

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

  it("nauji reisai priekabą dalina iš vidutinio kalendorinio mėnesio", () => {
    // 244 + 550 × 12 / 365 = 244 + 18,08 EUR
    expect(calcDailyRate({ ...OMNIVA_TRUCK, workingDaysPerMonth: DAYS_PER_MONTH })).toBe(24400 + 1808);
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

describe("calcProfitPerDay", () => {
  it("dalina pelną iš parų", () => {
    // 193 295 ct / 22 paros = 8786,14 → 8786 ct.
    expect(calcProfitPerDay(193295, 22)).toBe(8786);
  });

  it("lėtas krovinys: tas pats €/km, bet mažiau per parą", () => {
    // Tas pats 600 € pelnas už 3000 km: per 3 paras 200 €, per 5 – 120 € paroje.
    expect(calcProfitPerDay(60000, 3)).toBe(20000);
    expect(calcProfitPerDay(60000, 5)).toBe(12000);
  });

  it("nuostolį rodo kaip neigiamą", () => {
    expect(calcProfitPerDay(-30000, 4)).toBe(-7500);
  });

  it("grąžina null, kai parų nėra", () => {
    expect(calcProfitPerDay(193295, 0)).toBeNull();
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
    expect(result.profitPerDayCents).toBe(8786);
  });

  it("dienpinigiai pagal šalis pakeičia fiksuotus, o ne prisideda", () => {
    // Fiksuoti: perDiem × 22 paros. Pagal šalis – 1000 € visam reisui.
    const fixed = OMNIVA_TRIP.truck.dailyCents.perDiem * OMNIVA_TRIP.days;
    const byCountry = calcTrip({ ...OMNIVA_TRIP, perDiemCents: 100000 });

    expect(result.perDiemCents).toBe(fixed);
    expect(byCountry.perDiemCents).toBe(100000);
    expect(byCountry.truckCents).toBe(result.truckCents - fixed + 100000);
    expect(byCountry.totalCostCents).toBe(result.totalCostCents - fixed + 100000);
  });

  it("null – senas būdas", () => {
    expect(calcTrip({ ...OMNIVA_TRIP, perDiemCents: null }).truckCents).toBe(result.truckCents);
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

describe("calcContribution (imti ar neimti)", () => {
  const STAND: { days: number; contributionCents: number; thresholdCents: number } = { days: 0, contributionCents: 0, thresholdCents: 0 };
  const trip = { ...OMNIVA_TRIP, days: 4, perDiemCents: 40000 };

  it("įnašas = pajamos − kuras − AdBlue − keliai − dienpinigiai", () => {
    const result = calcTrip(trip);
    const c = calcContribution(result, 4, STAND);
    expect(c.contributionCents).toBe(result.revenueCents - result.fuelCents - result.adblueCents - result.roadCents - 40000);
    expect(c.variableCents + c.contributionCents).toBe(result.revenueCents);
  });

  it("tušti km įeina į kurą, AdBlue ir įnašą", () => {
    const full = calcTrip({ ...trip, emptyKm: 500, legs: [{ country: "Vokietija", km: 500 }] });
    const noEmpty = calcTrip({ ...trip, emptyKm: 0 });
    const lost = calcContribution(noEmpty, 4, STAND).contributionCents - calcContribution(full, 4, STAND).contributionCents;
    // 500 km: kuras 161,20 €, AdBlue 9,18 €, keliai 0,348 × 500 = 174 €.
    expect(lost).toBe(16120 + 918 + 17400);
  });

  it("pastovūs furos kaštai įeina tik į pilną pelną", () => {
    const result = calcTrip(trip);
    const c = calcContribution(result, 4, STAND);
    expect(c.contributionCents - result.profitCents).toBe(result.truckCents - result.perDiemCents);
  });

  it("dienpinigiai – tik už paras, kurių alternatyva neužimtų", () => {
    const result = calcTrip(trip);
    expect(calcContribution(result, 4, { ...STAND, days: 3 })).toMatchObject({ extraDays: 1, perDiemExtraCents: 10000 });
    expect(calcContribution(result, 4, { ...STAND, days: 6 })).toMatchObject({ extraDays: 0, perDiemExtraCents: 0 });
    // Trupmeninės paros: 2,4 paros prieš 2 – 0,4 papildomos.
    const fractional = calcTrip({ ...trip, days: 2.4, perDiemCents: 24000 });
    expect(calcContribution(fractional, 2.4, { ...STAND, days: 2 }).perDiemExtraCents).toBe(4000);
  });

  it("verdiktas lygina su alternatyva ir riba", () => {
    const result = calcTrip(trip);
    const c = calcContribution(result, 4, STAND);
    expect(c.take).toBe(c.contributionCents > 0);
    // Grįžimas tuščiam kainuotų 600 €: net nuostolingas krovinys už jį geresnis.
    const back = calcContribution({ ...result, revenueCents: c.variableCents - 50000 }, 4, { ...STAND, contributionCents: -60000 });
    expect(back).toMatchObject({ contributionCents: -50000, vsAlternativeCents: 10000, take: true });
    expect(calcContribution(result, 4, { ...STAND, thresholdCents: c.contributionCents }).take).toBe(false);
  });

  it("mažiausia verta kaina – kintami kaštai + alternatyva + riba", () => {
    const result = calcTrip(trip);
    const c = calcContribution(result, 4, { days: 0, contributionCents: -60000, thresholdCents: 5000 });
    expect(c.breakEvenPriceCents).toBe(c.variableCents - 60000 + 5000);
  });

  it("be parų dienpinigių nedalina iš nulio", () => {
    expect(calcContribution(calcTrip(trip), 0, STAND).perDiemExtraCents).toBe(0);
  });

  it("LTG 675 Lörenskog → Nässjö → Lörenskog: pigus krovinys pelno beveik neneša, bet įnašas teigiamas", () => {
    // Tikri reisai 2026-10-28/29 (Telematika 142701 ir 142703). Furos kaštų
    // kopija tokia pati kaip Omniva furos, tik priekaba dalinama iš kalendorinio mėnesio.
    const truck = { ...OMNIVA_TRUCK, workingDaysPerMonth: DAYS_PER_MONTH };
    const leg = (km: number, litresPer100Km: number, days: number, freightPriceCents: number): TripInput => ({
      truck, days, paidKm: km, emptyKm: 0,
      fuel: { litresPer100Km, pricePerLitre: 1.4734 },
      adblue: { litresPer100Km: 0, pricePerLitre: 0.732 },
      legs: [{ country: "Nemokami", km }],
      extras: { bridgesCents: 0, ferriesCents: 0, tunnelsCents: 0, parkingCents: 0 },
      revenue: { mode: "freight", freightPriceCents },
      tariffs: [{ country: "Nemokami", rate: 0, rateType: "per_km" }],
    });
    const there = calcTrip(leg(458.91, 29.7444, 1.083, 50000));
    const back = calcTrip(leg(546.66, 28.9943, 0.917, 120000));

    // Pilnas pelnas: 500 € vos padengia furos paras ir kurą – 15,05 €, 3 %.
    expect(there).toMatchObject({ fuelCents: 20112, truckCents: 28383, profitCents: 1505 });
    // Pastovūs kaštai mokami vis tiek: krovinys neša 298,88 €, imti verta nuo 201,12 €.
    expect(calcContribution(there, 1.083, STAND)).toMatchObject({ contributionCents: 29888, take: true, breakEvenPriceCents: 20112 });
    // Be jo fura vis tiek važiuotų į Nässjö tuščia, tad laimima visa frachto kaina.
    expect(calcContribution(there, 1.083, { days: 1.083, contributionCents: -20112, thresholdCents: 0 }).vsAlternativeCents).toBe(50000);
    expect(there.profitCents + back.profitCents).toBe(74119);
  });

  it("kontrolinis atgalinis krovinys Dortmundas–Kaunas nebėra nuostolingas", () => {
    // Iliustracinis pavyzdys iš verslo audito (ne rinkos duomenys): 1350 km,
    // pasiūlymas 1500 €, 269 €/parą, 31 l/100 km po 1,40 €, 12 % tuščios ridos,
    // ~280 € kelių, 3 paros, dienpinigiai 100 % normos – DE 62 + PL 48 + LT 28 €.
    const emptyKm = defaultEmptyKm(1350, 12);
    const tolls = 28000 + emptyKmTollCents(28000, 1350, emptyKm);
    const result = calcTrip({
      ...OMNIVA_TRIP,
      days: 3,
      paidKm: 1350,
      emptyKm,
      fuel: { litresPer100Km: 31, pricePerLitre: 1.4 },
      adblue: { litresPer100Km: 0, pricePerLitre: 0 },
      legs: [],
      extras: { bridgesCents: tolls, ferriesCents: 0, tunnelsCents: 0, parkingCents: 0 },
      revenue: { mode: "freight", freightPriceCents: 150000 },
      perDiemCents: 13800,
    });

    // Prieš: pilnas pelnas – nuostolis. Jis lieka, bet tik antraeilėje eilutėje.
    expect(result).toMatchObject({ fuelCents: 66580, roadCents: 31818, truckCents: 94500, profitCents: -42898 });

    // Po: net lyginant su stovinčia fura įnašas teigiamas.
    expect(calcContribution(result, 3, STAND)).toMatchObject({ contributionCents: 37802, take: true });

    // Lyginant su grįžimu tuščiam (tie patys 1350 km ir keliai, be 4 val. krovimo):
    // dienpinigiai tik už krovimo laiką, o krovinys duoda +1374,25 €.
    const emptyReturnCents = -(58590 + 28000);
    expect(calcContribution(result, 3, { days: 3 - 4 / 24, contributionCents: emptyReturnCents, thresholdCents: 0 })).toMatchObject({
      perDiemExtraCents: 767,
      contributionCents: 50835,
      vsAlternativeCents: 137425,
      take: true,
    });
  });
});

describe("calcTruckCost su trupmeninėmis paromis", () => {
  it("grąžina sveikus centus", () => {
    const cents = calcTruckCost(OMNIVA_TRUCK, 2.4);
    expect(Number.isInteger(cents)).toBe(true);
    expect(cents).toBe(Math.round(calcDailyRate(OMNIVA_TRUCK) * 2.4));
  });
});

describe("loadVerdict (savikaina – žemiausia kaina)", () => {
  it("nuo savikainos – imti", () => {
    expect(loadVerdict(0, -100, 0)).toBe("take");
    expect(loadVerdict(5000, 5000, 0)).toBe("take");
  });

  it("žemiau savikainos, bet geriau už alternatyvą – tik su vadovo pritarimu", () => {
    expect(loadVerdict(-42898, 37802, 0)).toBe("approval");
  });

  it("nepadengia net kintamų kaštų ar alternatyvos – neimti", () => {
    expect(loadVerdict(-42898, -1000, 0)).toBe("reject");
    expect(loadVerdict(-42898, 3000, 5000)).toBe("reject");
  });

  it("Šiauliai–Amersfoort: 1500 € – tik su pritarimu, 2250 € – imti", () => {
    // Iš greitos kainos: savikaina 1950,54 €, kintami kaštai 1379,21 €.
    const at = (revenue: number) => loadVerdict(revenue - 195054, revenue - 137921, 0);
    expect(at(137921)).toBe("reject");
    expect(at(150000)).toBe("approval");
    expect(at(195054)).toBe("take");
    expect(at(225000)).toBe("take");
  });
});
