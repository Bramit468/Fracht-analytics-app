import { describe, expect, it } from "vitest";

import { dailyArchiveRows, supplyArchiveRows } from "./telematics-archive";

describe("dailyArchiveRows", () => {
  it("paima ridą ir kurą, numerį suvienodina", () => {
    const rows = dailyArchiveRows([
      { ObjectId: "733", Date: "2026-09-01", Plates: "lov  141", DayDistance: 207.38, DayFuelConsumption: "53.9" },
    ]);

    expect(rows).toEqual([
      { plate: "LOV 141", date: "2026-09-01", km: 207.38, fuel_l: 53.9 },
    ]);
  });

  it("be kuro daviklio lieka null, o ne nulis", () => {
    // Nulis reikštų „nesunaudota", o čia tiesiog nežinoma. Sudėjus į
    // suvestinę tas skirtumas nulemtų l/100 km.
    const [row] = dailyArchiveRows([{ Date: "2026-09-01", Plates: "LSE 728", DayDistance: 300 }]);
    expect(row.fuel_l).toBeNull();
  });

  it("tą patį raktą atsakyme palieka vieną kartą", () => {
    // Lentelės raktas yra (įmonė, numeris, data). Du įrašai tuo pačiu raktu
    // visą įrašymą nutrauktų, tad pasikartojimas išsprendžiamas čia.
    const rows = dailyArchiveRows([
      { Date: "2026-09-01", Plates: "LOV 141", DayDistance: 100 },
      { Date: "2026-09-01", Plates: "lov 141", DayDistance: 207.38 },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].km).toBe(207.38);
  });

  it("praleidžia eilutes be datos, numerio ar ridos", () => {
    const rows = dailyArchiveRows([
      { Plates: "LOV 141", DayDistance: 100 },
      { Date: "2026-09-01", DayDistance: 100 },
      { Date: "2026-09-01", Plates: "LOV 141" },
      { Date: "2026-09-01", Plates: "LOV 141", DayDistance: -5 },
    ]);

    expect(rows).toEqual([]);
  });
});

describe("supplyArchiveRows", () => {
  it("išsaugo pirkimą be furos numerio", () => {
    // Šitie iki #49 dingdavo be pėdsako, o jų per 30 dienų buvo už
    // −19 226,94 €. Archyve jie privalo išlikti.
    const [row] = supplyArchiveRows([
      {
        ItemId: "77", TypeTitle: "Other", OperationDate: "2026-09-03 15:00:00",
        TotalPrice: "-1204.450", CurrencyShortTitle: "EUR", Comment: "PVM grąžinimas",
      },
    ]);

    expect(row.plate).toBeNull();
    expect(row.total_price).toBe(-1204.45);
    expect(row.comment).toBe("PVM grąžinimas");
  });

  it("išsaugo ne eurais pirktą, valiutos neverčia", () => {
    const [row] = supplyArchiveRows([
      {
        ItemId: "78", Plates: "LOV 141", TypeTitle: "Diesel",
        OperationDate: "2026-09-04 10:00:00", TotalPrice: "980.00",
        CurrencyShortTitle: "NOK", Quantity: "600",
      },
    ]);

    expect(row.currency).toBe("NOK");
    expect(row.total_price).toBe(980);
  });

  it("datą nukerpa iki dienos", () => {
    const [row] = supplyArchiveRows([
      { ItemId: "79", OperationDate: "2026-09-04 10:00:00", TotalPrice: "1", CurrencyShortTitle: "EUR" },
    ]);

    expect(row.date).toBe("2026-09-04");
  });

  it("tą patį ItemId palieka vieną kartą", () => {
    const rows = supplyArchiveRows([
      { ItemId: "80", OperationDate: "2026-09-04", TotalPrice: "1", CurrencyShortTitle: "EUR" },
      { ItemId: "80", OperationDate: "2026-09-04", TotalPrice: "2", CurrencyShortTitle: "EUR" },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].total_price).toBe(2);
  });

  it("praleidžia eilutes be ItemId, datos, kainos ar valiutos", () => {
    const rows = supplyArchiveRows([
      { OperationDate: "2026-09-04", TotalPrice: "1", CurrencyShortTitle: "EUR" },
      { ItemId: "81", TotalPrice: "1", CurrencyShortTitle: "EUR" },
      { ItemId: "82", OperationDate: "2026-09-04", CurrencyShortTitle: "EUR" },
      { ItemId: "83", OperationDate: "2026-09-04", TotalPrice: "1" },
    ]);

    expect(rows).toEqual([]);
  });

  it("nulinė kaina nėra priežastis išmesti", () => {
    // `!totalPrice` būtų atmetęs nulį kartu su null.
    const [row] = supplyArchiveRows([
      { ItemId: "84", OperationDate: "2026-09-04", TotalPrice: "0", CurrencyShortTitle: "EUR" },
    ]);

    expect(row.total_price).toBe(0);
  });
});
