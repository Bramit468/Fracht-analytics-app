import { describe, expect, it } from "vitest";
import { parseCanDaily, parseSupplies, summarizeActuals } from "./telematics-costs";

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
  const { supplies, skipped } = parseSupplies(SUPPLIES);
  return summarizeActuals(
    parseCanDaily(CAN_DAILY), supplies, skipped, plate, RUGSEJO_PRADZIA, RUGSEJO_PABAIGA,
  );
}

describe("parseSupplies", () => {
  it("kelio mokestį atpažįsta iš komentaro, ne tik iš tipo", () => {
    const { supplies } = parseSupplies(SUPPLIES);

    // „Toll_Norway" ateina kaip „Other" – pagal tipą jis būtų pradingęs.
    expect(supplies.filter((s) => s.kind === "toll").map((s) => s.costCents)).toEqual([12650, 12400]);
  });

  it("kitos valiutos pirkimą suskaičiuoja atskirai, o ne priskiria nuliui", () => {
    const { supplies, skipped } = parseSupplies(SUPPLIES);

    expect(skipped).toBe(1);
    expect(supplies).toHaveLength(5);
  });

  it("tris skaitmenis po kablelio apvalina iki centų", () => {
    const { supplies } = parseSupplies(SUPPLIES);

    expect(supplies[0].costCents).toBe(34414);
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
