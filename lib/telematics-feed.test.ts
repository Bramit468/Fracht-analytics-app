import { describe, expect, it } from "vitest";

import { supplyArchiveRows } from "./telematics-archive";
import { parseSupplies } from "./telematics-costs";
import { slimSupplies } from "./telematics-feed";

// Visi 21 tiekėjo laukas, kaip gyvame atsakyme; reikšmės sugalvotos.
const ROWS = [
  {
    ItemId: "501", ObjectId: "733", Number: "LOV 141", Plates: "LOV 141", TypeId: "1", TypeTitle: "Fuel",
    OperationDate: "2026-10-01 08:15:00", Supplier: "Circle K", Quantity: "412.50", UnitId: "1",
    UnitTitle: "Litras", UnitShortTitle: "l", TotalPrice: "630.120", CurrencyId: "1", CurrencyTitle: "Euras",
    CurrencyShortTitle: "EUR", Comment: null, Country: "SWE", CurrencyExchangeRate: "1", Odometer: "738900.1",
    DiscountPriceEur: "1.52",
  },
  {
    ItemId: "502", ObjectId: "733", Number: "LOV 141", Plates: null, TypeId: "9", TypeTitle: "Other",
    OperationDate: "2026-10-02 10:00:00", Supplier: null, Quantity: null, UnitId: null, UnitTitle: null,
    UnitShortTitle: null, TotalPrice: "1200.000", CurrencyId: "4", CurrencyTitle: "Švedijos krona",
    CurrencyShortTitle: "SEK", Comment: "Kelių mokestis", Country: "SWE", CurrencyExchangeRate: null,
    Odometer: null, DiscountPriceEur: null,
  },
];

describe("slimSupplies", () => {
  it("apkarpytas atsakymas duoda tuos pačius skaičius kaip pilnas", () => {
    const slim = slimSupplies(ROWS);
    const toEuro = () => 10_500;

    expect(parseSupplies(slim, toEuro)).toEqual(parseSupplies(ROWS, toEuro));
    expect(supplyArchiveRows(slim)).toEqual(supplyArchiveRows(ROWS));
  });

  it("išmeta nenaudojamus laukus", () => {
    const [row] = slimSupplies(ROWS) as Record<string, unknown>[];

    expect(Object.keys(row)).toHaveLength(10);
    expect(row).not.toHaveProperty("Supplier");
  });

  it("ne sąrašą palieka parseriui, kad šis praneštų klaidą", () => {
    expect(slimSupplies({ error: "invalid token" })).toEqual({ error: "invalid token" });
  });
});
