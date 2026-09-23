import { describe, expect, it } from "vitest";
import {
  parseCanDaily,
  parseSupplies,
  summarizeActuals,
  tripFillFromActuals,
} from "./telematics-costs";

// Sutrumpintos tikrų atsakymų kopijos. Numeriai ir tiekėjai palikti, nes tai
// įmonės duomenys; vairuotojų laukų čia nėra.
const CAN_DAILY = [
  {
    ObjectId: "733", Date: "2026-09-01", Plates: "LOV 141",
    OdometerStart: "738571.020", OdometerEnd: "738778.400", DayDistance: 207.38,
    FuelConsumptionStart: "168846.500", FuelConsumptionEnd: "168907.500", DayFuelConsumption: 61,
  },
  {
    ObjectId: "733", Date: "2026-09-02", Plates: "lov 141",
    OdometerStart: "738778.400", OdometerEnd: "739474.850", DayDistance: 696.45,
    FuelConsumptionStart: "168907.500", FuelConsumptionEnd: "169108.000", DayFuelConsumption: 200.5,
  },
  {
    // Diena už laikotarpio ribų.
    ObjectId: "733", Date: "2026-10-01", Plates: "LOV 141",
    OdometerStart: "0", OdometerEnd: "0", DayDistance: 500, DayFuelConsumption: 150,
  },
  {
    // Kita fura – į sumą patekti neturi.
    ObjectId: "842", Date: "2026-09-01", Plates: "LSE 728",
    OdometerStart: "0", OdometerEnd: "0", DayDistance: 300, DayFuelConsumption: 90,
  },
];

const SUPPLIES = [
  {
    ItemId: "1", ObjectId: "733", Number: "LOV 141", Plates: "LOV 141",
    TypeTitle: "Diesel", OperationDate: "2026-09-01 08:12:00", Supplier: "E100",
    Quantity: "250.000", TotalPrice: "344.140", CurrencyShortTitle: "EUR",
    Comment: "Diesel", Country: "DEU",
  },
  {
    ItemId: "2", ObjectId: "733", Number: "LOV 141", Plates: "LOV 141",
    TypeTitle: "Ad Blue", OperationDate: "2026-09-02 17:44:20", Supplier: "Q8Oils",
    Quantity: "40.000", TotalPrice: "30.860", CurrencyShortTitle: "EUR",
    Comment: "UREA (Ad Blue)", Country: "SWE",
  },
  {
    // Kelio mokestis slepiasi po „Other", tikrasis požymis yra komentaras.
    ItemId: "3", ObjectId: "733", Number: "LOV 141", Plates: "LOV 141",
    TypeTitle: "Other", OperationDate: "2026-09-02 09:00:00", Supplier: "E100",
    Quantity: "0.000", TotalPrice: "126.500", CurrencyShortTitle: "EUR",
    Comment: "Toll_Norway, ", Country: "NOR",
  },
  {
    ItemId: "4", ObjectId: "733", Number: "LOV 141", Plates: "LOV 141",
    TypeTitle: "Eurovignettes", OperationDate: "2026-09-03 13:16:00", Supplier: "DKV",
    Quantity: "0.000", TotalPrice: "124.000", CurrencyShortTitle: "EUR",
    Comment: "0577 Electronic Eurovignette, DE (EUR)", Country: "DEU",
  },
  {
    // Ne kelias ir ne kuras – į reiso kaštus nepatenka.
    ItemId: "5", ObjectId: "733", Number: "LOV 141", Plates: "LOV 141",
    TypeTitle: "Other", OperationDate: "2026-09-03 14:59:00", Supplier: "DKV",
    Quantity: "45.920", TotalPrice: "71.793", CurrencyShortTitle: "EUR",
    Comment: "0036 PETROL-EURO 95, KLAIPEDA (EUR)", Country: null,
  },
  {
    // Kita valiuta – geriau suskaičiuoti atskirai, nei spėti kursą.
    ItemId: "6", ObjectId: "733", Number: "LOV 141", Plates: "LOV 141",
    TypeTitle: "Other", OperationDate: "2026-09-03 15:00:00", Supplier: "E100",
    Quantity: "0.000", TotalPrice: "0.512", CurrencyShortTitle: null,
    Comment: "Commission fee, ", Country: null,
  },
];

const RUGSEJO_PRADZIA = "2026-09-01";
const RUGSEJO_PABAIGA = "2026-09-30";

function santrauka(plate = "LOV 141") {
  const { supplies } = parseSupplies(SUPPLIES);
  return summarizeActuals(
    parseCanDaily(CAN_DAILY), supplies, plate, RUGSEJO_PRADZIA, RUGSEJO_PABAIGA,
  );
}

describe("parseSupplies", () => {
  it("kelio mokestį atpažįsta iš komentaro, ne tik iš tipo", () => {
    const { supplies } = parseSupplies(SUPPLIES);

    // „Toll_Norway" ateina kaip „Other" – pagal tipą jis būtų pradingęs.
    expect(supplies.filter((s) => s.kind === "toll").map((s) => s.costCents)).toEqual([12650, 12400]);
  });

  it("kitos valiutos pirkimą suskaičiuoja atskirai, o ne priskiria nuliui", () => {
    const { supplies, issues } = parseSupplies(SUPPLIES);

    expect(issues.otherCurrencyRows).toBe(1);
    expect(supplies).toHaveLength(5);
  });

  it("tris skaitmenis po kablelio apvalina iki centų", () => {
    const { supplies } = parseSupplies(SUPPLIES);

    expect(supplies[0].costCents).toBe(34414);
  });
});

describe("praleisti ne eurais pirkimai", () => {
  it("grąžinami su fura ir data, kad būtų galima įspėti tik tą reisą", () => {
    // Lentelei užtenka skaičiaus, o reiso formai reikia žinoti, kurią furą ir
    // kurį laikotarpį tai liečia: ten suma įrašoma į reisą.
    const { issues } = parseSupplies([
      {
        ItemId: "900", Plates: "lov 141", TypeTitle: "Other",
        OperationDate: "2026-09-05 11:00:00", TotalPrice: "480.000",
        CurrencyShortTitle: "NOK", Comment: "Bompenger",
      },
    ]);

    expect(issues.otherCurrencyRows).toBe(1);
    expect(issues.otherCurrency).toEqual([
      { plate: "LOV 141", date: "2026-09-05", currency: "NOK" },
    ]);
  });

  it("su kursu kronos patenka į kelių sumą, o ne į praleistas", () => {
    // Be kurso Norvegijos reisas rodydavo „keliai 0,00 €" (#57).
    const kursas = (amount: number, currency: string) =>
      currency === "NOK" ? Math.round((amount / 11.7025) * 100) : null;

    const { supplies, issues } = parseSupplies(
      [
        {
          ItemId: "902", Plates: "LOV 141", TypeTitle: "Other",
          OperationDate: "2026-09-05", TotalPrice: "480.000",
          CurrencyShortTitle: "NOK", Comment: "Bompenger",
        },
      ],
      kursas,
    );

    expect(supplies).toHaveLength(1);
    expect(supplies[0].kind).toBe("toll");
    expect(supplies[0].costCents).toBe(4102);
    expect(issues.convertedRows).toBe(1);
    expect(issues.convertedCents).toBe(4102);
    expect(issues.otherCurrencyRows).toBe(0);
  });

  it("valiuta be kurso lieka praleista, o ne konvertuota spėjant", () => {
    const { supplies, issues } = parseSupplies(
      [{ ItemId: "903", Plates: "LOV 141", OperationDate: "2026-09-05", TotalPrice: "10", CurrencyShortTitle: "PLN" }],
      () => null,
    );

    expect(supplies).toEqual([]);
    expect(issues.otherCurrencyRows).toBe(1);
    expect(issues.convertedRows).toBe(0);
  });

  it("pirkimas be numerio irgi patenka į sąrašą", () => {
    const { issues } = parseSupplies([
      { ItemId: "901", OperationDate: "2026-09-05", TotalPrice: "10", CurrencyShortTitle: "PLN" },
    ]);

    expect(issues.otherCurrency[0].plate).toBeNull();
  });
});

describe("summarizeActuals", () => {
  it("sudeda tik tos furos ir to laikotarpio duomenis", () => {
    expect(santrauka()).toMatchObject({
      plate: "LOV 141",
      days: 2,
      km: 903.83,
      fuelL: 261.5,
      dieselCents: 34414,
      adblueCents: 3086,
      tollCents: 25050,
      totalCents: 62550,
    });
  });

  it("skaičiuoja faktinę kuro kainą ir sąnaudas", () => {
    const stats = santrauka();

    expect(stats.fuelPricePerL).toBeCloseTo(1.3766, 4);
    expect(stats.litresPer100Km).toBeCloseTo(28.9, 1);
  });

  it("nevažiavusiai furai grąžina nulius, o santykinius rodiklius – null", () => {
    expect(santrauka("NEZINOMA 111")).toMatchObject({
      km: 0, totalCents: 0, fuelPricePerL: null, litresPer100Km: null,
    });
  });

  it("numerio rašybos skirtumai nesuskaldo tos pačios furos", () => {
    // Antra diena atsakyme atėjo mažosiomis raidėmis.
    expect(santrauka().days).toBe(2);
  });
});

describe("tripFillFromActuals", () => {
  it("užpildo laukus taip, kaip juos skaito forma", () => {
    expect(tripFillFromActuals(santrauka())).toEqual({
      days: "30",
      paid_km: "903.83",
      empty_km: "0",
      fuel_l_per_100km: "28.9324",
      fuel_price: "1.3766",
      adblue_l_per_100km: "4.4256",
      adblue_price: "0.7715",
      bridges_cents: "250.50",
      legKm: "903.83",
    });
  });

  it("dienas skaičiuoja imtinai", () => {
    const { supplies } = parseSupplies(SUPPLIES);
    const viena = summarizeActuals(
      parseCanDaily(CAN_DAILY), supplies, "LOV 141", "2026-09-01", "2026-09-01",
    );

    expect(tripFillFromActuals(viena).days).toBe("1");
  });

  it("be kuro pirkimų palieka kainą tuščią, o ne nulį", () => {
    // Nulis atrodytų kaip nemokamas kuras ir tyliai iškreiptų pelną.
    const tuscias = summarizeActuals([], [], "LOV 141", "2026-09-01", "2026-09-30");
    const fill = tripFillFromActuals(tuscias);

    expect(fill.fuel_price).toBe("");
    expect(fill.fuel_l_per_100km).toBe("");
  });
});

describe("numerių rašybos skirtumai", () => {
  it("sujungia furą, kurios km ir pirkimai rašomi skirtingai", () => {
    // CANDaily siunčia „LZR 118", Supplies – „LZR118". Iki pataisymo fura
    // suskildavo į dvi: viena su km be kaštų, kita su kaštais be km.
    const can = parseCanDaily([
      { Date: "2026-09-10", Plates: "LZR 118", DayDistance: 500, DayFuelConsumption: 150 },
    ]);
    const { supplies } = parseSupplies([
      {
        Plates: "LZR118", TypeTitle: "Diesel", OperationDate: "2026-09-10 10:00:00",
        Quantity: "150.000", TotalPrice: "200.000", CurrencyShortTitle: "EUR",
        Comment: "Diesel", Country: "LTU",
      },
    ]);

    // Nesvarbu, kuria rašyba klausiama – atsakymas tas pats.
    for (const numeris of ["LZR118", "LZR 118", "lzr 118"]) {
      expect(summarizeActuals(can, supplies, numeris, "2026-09-01", "2026-09-30"))
        .toMatchObject({ km: 500, dieselCents: 20000 });
    }
  });
});

describe("nieko nedingsta tyliai", () => {
  const KITOMIS_KALBOMIS = [
    {
      Plates: "LOV 141", TypeTitle: "Other", OperationDate: "2026-09-04 10:00:00",
      Quantity: "0.000", TotalPrice: "82.500", CurrencyShortTitle: "EUR",
      Comment: "Maut Deutschland", Country: "DEU",
    },
    {
      Plates: "LOV 141", TypeTitle: "Other", OperationDate: "2026-09-05 10:00:00",
      Quantity: "0.000", TotalPrice: "41.300", CurrencyShortTitle: "EUR",
      Comment: "Péage APRR", Country: "FRA",
    },
    {
      Plates: "LOV 141", TypeTitle: "Other", OperationDate: "2026-09-06 10:00:00",
      Quantity: "0.000", TotalPrice: "25.100", CurrencyShortTitle: "EUR",
      Comment: "Pedaggio Autostrade", Country: "ITA",
    },
    {
      // Tikrai ne kelias – plovykla. Turi likti „kita".
      Plates: "LOV 141", TypeTitle: "Other", OperationDate: "2026-09-07 10:00:00",
      Quantity: "1.000", TotalPrice: "30.000", CurrencyShortTitle: "EUR",
      Comment: "Truck wash", Country: "LTU",
    },
    {
      // Be numerio – įmonės lygio mokestis.
      Plates: "", Number: null, TypeTitle: "Other", OperationDate: "2026-09-08 10:00:00",
      Quantity: "0.000", TotalPrice: "12.750", CurrencyShortTitle: "EUR",
      Comment: "Commission fee", Country: null,
    },
  ];

  it("kelio mokestį atpažįsta ir vokiškai, prancūziškai, itališkai", () => {
    const { supplies } = parseSupplies(KITOMIS_KALBOMIS);
    const keliai = supplies.filter((s) => s.kind === "toll");

    // Be šito Maut, Péage ir Pedaggio nukristų į „kita", o savikaina €/km
    // atrodytų mažesnė, nei yra.
    expect(keliai.map((s) => s.costCents)).toEqual([8250, 4130, 2510]);
  });

  it("ne kelio išlaidos lieka atskirai ir į bendrą sumą neįeina", () => {
    const { supplies } = parseSupplies(KITOMIS_KALBOMIS);
    const stats = summarizeActuals([], supplies, "LOV 141", "2026-09-01", "2026-09-30");

    expect(stats.tollCents).toBe(14890);
    expect(stats.otherCents).toBe(3000);
    expect(stats.totalCents).toBe(14890);
  });

  it("pirkimą be furos numerio suskaičiuoja, o ne išmeta", () => {
    const { issues } = parseSupplies(KITOMIS_KALBOMIS);

    expect(issues).toEqual({
      unassignedRows: 1,
      unassignedCents: 1275,
      otherCurrencyRows: 0,
      otherCurrency: [],
      convertedRows: 0,
      convertedCents: 0,
    });
  });
});
