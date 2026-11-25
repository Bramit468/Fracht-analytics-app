import { describe, expect, it } from "vitest";

import { mergeRawPayloads, mergeSupplyPayloads } from "./telematics-archive";
import { parseSupplies } from "./telematics-costs";

describe("mergeRawPayloads", () => {
  it("archyvas + gyvas srautas; ta pati eilutė – gyva", () => {
    const archived = [{ OrderId: 1, OrderPrice: 100 }, { OrderId: 2, OrderPrice: 200 }];
    const merged = mergeRawPayloads("orders", archived, [{ OrderId: 2, OrderPrice: 250 }, { OrderId: 3, OrderPrice: 300 }]);
    expect(merged).toEqual([{ OrderId: 1, OrderPrice: 100 }, { OrderId: 2, OrderPrice: 250 }, { OrderId: 3, OrderPrice: 300 }]);
  });

  it("užsakymas dar sraute – archyvo atkarpos jam neimamos (ištrinta atkarpa nelieka)", () => {
    const archived = [{ TripId: 1, OrderId: 7 }, { TripId: 2, OrderId: 7 }, { TripId: 3, OrderId: 8 }];
    expect(mergeRawPayloads("trips", archived, [{ TripId: 1, OrderId: 7 }])).toEqual([{ TripId: 3, OrderId: 8 }, { TripId: 1, OrderId: 7 }]);
  });

  it("be gyvo srauto – tik archyvas", () => {
    expect(mergeRawPayloads("orders", [{ OrderId: 1 }], null)).toEqual([{ OrderId: 1 }]);
  });
});

describe("mergeSupplyPayloads", () => {
  it("archyvo pirkimas skaitomas tuo pačiu parseSupplies", () => {
    const merged = mergeSupplyPayloads(
      [{ item_id: "a", plate: "MHE 763", date: "2026-10-01", type_title: "Eurovignettes", comment: null, quantity: null, total_price: 12.5, currency: "EUR", country: "SWE" }],
      [{ ItemId: "b", Plates: "MHE 763", OperationDate: "2026-11-01 10:00:00", TypeTitle: "Diesel", Quantity: "100", TotalPrice: "150.00", CurrencyShortTitle: "EUR" }],
    );
    const { supplies } = parseSupplies(merged);
    expect(supplies.map((row) => [row.date, row.kind, row.costCents])).toEqual([["2026-10-01", "toll", 1250], ["2026-11-01", "diesel", 15000]]);
  });
});
