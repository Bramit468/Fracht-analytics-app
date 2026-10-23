import { describe, expect, it } from "vitest";

import { ASSISTANT_TOOLS, filterTrips, runAssistantTool, type AssistantData } from "./assistant-tools";
import type { TripSummary } from "./trips";

function trip(overrides: Partial<TripSummary>): TripSummary {
  return {
    id: "t",
    tripNumber: "LT1",
    origin: "Vilnius",
    destination: "Hamburg",
    tripDate: "2026-10-05",
    truckPlate: "NNN 888",
    customerId: null,
    invoicedOn: null,
    paidOn: null,
    paidKm: 1000,
    days: 2,
    emptyKm: 0,
    emptyFuelCents: 0,
    revenueCents: 150000,
    totalCostCents: 120000,
    profitCents: 30000,
    marginPercent: 20,
    profitPerKm: 0.3,
    profitPerDayCents: 15000,
    roadByCountry: [],
    ...overrides,
  };
}

const data: AssistantData = {
  today: "2026-10-23",
  customers: [
    { id: "c1", name: "UAB Girteka Logistics", payment_terms_days: 30 },
    { id: "c2", name: "Kitas", payment_terms_days: null },
  ],
  trucks: [],
  trips: [
    trip({ id: "a", tripNumber: "A", tripDate: "2026-09-10", customerId: "c1", truckPlate: "AAA111" }),
    trip({ id: "b", tripNumber: "B", tripDate: "2026-10-01", customerId: "c2", revenueCents: 100000, totalCostCents: 110000, profitCents: -10000, marginPercent: -10, profitPerDayCents: -5000 }),
    trip({ id: "c", tripNumber: "C", tripDate: "2026-10-20", customerId: "c1", invoicedOn: "2026-09-01" }),
  ],
};

function run(name: string, args: object) {
  return runAssistantTool(name, JSON.stringify(args), data) as Record<string, unknown>;
}

const noFilter = { from: null, to: null, plate: null, customer: null };

describe("filterTrips", () => {
  it("datos imtinės, fura be tarpų, užsakovas pagal pavadinimo dalį", () => {
    expect(filterTrips(data, { ...noFilter, from: "2026-10-01", to: "2026-10-20" }).map((t) => t.id)).toEqual(["b", "c"]);
    expect(filterTrips(data, { ...noFilter, plate: "aaa 111" }).map((t) => t.id)).toEqual(["a"]);
    expect(filterTrips(data, { ...noFilter, customer: "girteka" }).map((t) => t.id)).toEqual(["a", "c"]);
  });
});

describe("get_summary", () => {
  it("skaičiuoja tomis pačiomis funkcijomis kaip suvestinė ir grąžina eurais", () => {
    const result = run("get_summary", { ...noFilter, from: "2026-10-01", to: "2026-10-31" });
    expect(result.reisai).toBe(2);
    // 1 500 + 1 000 pajamų, 300 − 100 pelno.
    expect(result.pajamos).toBe(new Intl.NumberFormat("lt-LT", { style: "currency", currency: "EUR" }).format(2500));
    expect(result.pelnas).toBe(new Intl.NumberFormat("lt-LT", { style: "currency", currency: "EUR" }).format(200));
    expect(result.marza).toBe("8.0 %");
    expect(result.nuostolingi_reisai).toBe(1);
  });
});

describe("profit_by", () => {
  it("worst – mažiausio pelno pirmas", () => {
    const result = run("profit_by", { ...noFilter, group: "customer", order: "worst", limit: null });
    expect((result.eilutes as { pavadinimas: string }[])[0].pavadinimas).toBe("Kitas");
  });

  it("mėnesiai chronologiškai, rodomi paskutiniai", () => {
    const result = run("profit_by", { ...noFilter, group: "month", order: "best", limit: 1 });
    expect(result.is_viso_grupiu).toBe(2);
    expect((result.eilutes as { pavadinimas: string }[]).map((row) => row.pavadinimas)).toEqual(["2026-10"]);
  });
});

describe("list_trips", () => {
  it("riboja eilučių skaičių ir rikiuoja pagal pelną", () => {
    const result = run("list_trips", { ...noFilter, sort: "profit_asc", limit: 1 });
    expect(result.is_viso_reisu).toBe(3);
    expect((result.reisai as { numeris: string }[]).map((row) => row.numeris)).toEqual(["B"]);
  });
});

describe("payments", () => {
  it("vėluojanti sąskaita: išrašyta 09-01, terminas 30 d., šiandien 10-23", () => {
    const result = run("payments", { ...noFilter, limit: null });
    expect(result.veluojanciu_saskaitu).toBe(1);
    expect(result.veluojancios).toEqual([expect.objectContaining({ numeris: "C", busena: "Vėluoja 22 d." })]);
  });
});

describe("klaidos grąžinamos modeliui, ne metamos", () => {
  it("bloga data", () => {
    expect(run("get_summary", { ...noFilter, from: "spalis" })).toEqual({ klaida: "from turi būti data formatu YYYY-MM-DD." });
  });

  it("nežinomas įrankis ir sugadintas JSON", () => {
    expect(run("drop_table", {})).toEqual({ klaida: "Nežinomas įrankis: drop_table" });
    expect(runAssistantTool("get_summary", "{", data)).toEqual({ klaida: "Argumentai nėra tinkamas JSON." });
  });
});

it("griežtiems įrankiams visi laukai privalomi", () => {
  for (const { function: fn } of ASSISTANT_TOOLS) {
    const parameters = fn.parameters as { properties: object; required: string[] };
    expect(parameters.required.sort()).toEqual(Object.keys(parameters.properties).sort());
  }
});
