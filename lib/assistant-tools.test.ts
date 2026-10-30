import { describe, expect, it } from "vitest";

import {
  ASSISTANT_TOOLS,
  filterTrips,
  runAssistantTool,
  type AssistantContext,
  type AssistantData,
  type TelematicsData,
} from "./assistant-tools";
import { truckRowToCalc } from "./truck";
import type { TripSummary } from "./trips";
import type { Trip } from "../types/trip";
import type { Truck } from "../types/truck";

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

const truck: Truck = {
  id: "truck-1",
  plate: "NNN 888",
  depreciation_cents: 0,
  interest_cents: 0,
  insurance_kasko_cents: 0,
  insurance_civil_cents: 0,
  insurance_cmr_cents: 0,
  driver_salary_monthly_cents: 304167, // 100,00 €/parą
  per_diem_cents: 0,
  repairs_cents: 0,
  management_cents: 0,
  trailer_monthly_cents: 0,
  empty_weight_kg: null,
  total_permitted_weight_kg: null,
  // Draudimas baigiasi po 7 d. – turi būti įspėjimas.
  insurance_valid_until: "2026-10-30",
};

/** Išsaugotas reisas planui prieš faktą: 1 000 km, 30 l/100 km po 1,50 € = 450 € kuro. */
const rawTrip: Trip = {
  id: "raw-1",
  trip_number: "LT77",
  origin: "Kaunas",
  destination: "Poznań",
  trip_date: "2026-10-10",
  truck_id: truck.id,
  days: 2,
  paid_km: 1000,
  empty_km: 0,
  fuel_l_per_100km: 30,
  fuel_price: 1.5,
  adblue_l_per_100km: 0,
  adblue_price: 0,
  bridges_cents: 0,
  ferries_cents: 0,
  tunnels_cents: 0,
  parking_cents: 0,
  revenue_mode: "freight",
  rate_per_km: null,
  freight_price_cents: 100000,
  truck_costs: truckRowToCalc(truck),
  created_at: "2026-10-09T10:00:00Z",
};

const data: AssistantData = {
  today: "2026-10-23",
  customers: [
    { id: "c1", name: "UAB Girteka Logistics", payment_terms_days: 30 },
    { id: "c2", name: "Kitas", payment_terms_days: null },
  ],
  trucks: [truck],
  rawTrips: [rawTrip],
  legs: [{ id: "leg-1", trip_id: rawTrip.id, country: "Nemokami", km: 1000 }],
  tariffs: [{ country: "Nemokami", rate: 0, rateType: "per_km" }],
  settings: { minMarginPercent: 12, perDiemPercent: null, minContributionCents: null },
  trips: [
    trip({ id: "a", tripNumber: "A", tripDate: "2026-09-10", customerId: "c1", truckPlate: "AAA111" }),
    trip({ id: "b", tripNumber: "B", tripDate: "2026-10-01", customerId: "c2", revenueCents: 100000, totalCostCents: 110000, profitCents: -10000, marginPercent: -10, profitPerDayCents: -5000 }),
    trip({ id: "c", tripNumber: "C", tripDate: "2026-10-20", customerId: "c1", invoicedOn: "2026-09-01" }),
  ],
};

/** Telematika: fura važiavo 2 reiso dienas po 500 km, sudegino 320 l, pirko 300 l už 480 €. */
const telematics: TelematicsData = {
  daily: [
    { plate: "NNN 888", date: "2026-10-10", km: 500, fuelL: 160 },
    { plate: "NNN 888", date: "2026-10-11", km: 500, fuelL: 160 },
  ],
  supplies: [
    { plate: "NNN888", date: "2026-10-10", kind: "diesel", quantity: 200, costCents: 32000, country: "POL" },
    { plate: "NNN888", date: "2026-10-11", kind: "diesel", quantity: 100, costCents: 16000, country: "LTU" },
    { plate: "NNN888", date: "2026-10-11", kind: "toll", quantity: null, costCents: 5000, country: "POL" },
  ],
  issues: { unassignedRows: 0, unassignedCents: 0, otherCurrencyRows: 0, convertedRows: 0, convertedCents: 0, otherCurrency: [] },
};

const context: AssistantContext = {
  data: async () => data,
  telematics: async () => telematics,
  live: async () => null,
};

const noTelematics: AssistantContext = { ...context, telematics: async () => null };

async function run(name: string, args: object, ctx: AssistantContext = context) {
  return (await runAssistantTool(name, JSON.stringify(args), ctx)) as Record<string, unknown>;
}

const euro = (value: number) => new Intl.NumberFormat("lt-LT", { style: "currency", currency: "EUR" }).format(value);

const noFilter = { from: null, to: null, plate: null, customer: null };

describe("filterTrips", () => {
  it("datos imtinės, fura be tarpų, užsakovas pagal pavadinimo dalį", () => {
    expect(filterTrips(data, { ...noFilter, from: "2026-10-01", to: "2026-10-20" }).map((t) => t.id)).toEqual(["b", "c"]);
    expect(filterTrips(data, { ...noFilter, plate: "aaa 111" }).map((t) => t.id)).toEqual(["a"]);
    expect(filterTrips(data, { ...noFilter, customer: "girteka" }).map((t) => t.id)).toEqual(["a", "c"]);
  });
});

describe("get_summary", () => {
  it("skaičiuoja tomis pačiomis funkcijomis kaip suvestinė ir grąžina eurais", async () => {
    const result = await run("get_summary", { ...noFilter, from: "2026-10-01", to: "2026-10-31" });
    expect(result.reisai).toBe(2);
    // 1 500 + 1 000 pajamų, 300 − 100 pelno.
    expect(result.pajamos).toBe(euro(2500));
    expect(result.pelnas).toBe(euro(200));
    expect(result.marza).toBe("8,0 %");
    expect(result.nuostolingi_reisai).toBe(1);
  });
});

describe("profit_by", () => {
  it("worst – mažiausio pelno pirmas", async () => {
    const result = await run("profit_by", { ...noFilter, group: "customer", order: "worst", limit: null });
    expect((result.eilutes as { pavadinimas: string }[])[0].pavadinimas).toBe("Kitas");
  });

  it("mėnesiai chronologiškai, rodomi paskutiniai", async () => {
    const result = await run("profit_by", { ...noFilter, group: "month", order: "best", limit: 1 });
    expect(result.is_viso_grupiu).toBe(2);
    expect((result.eilutes as { pavadinimas: string }[]).map((row) => row.pavadinimas)).toEqual(["2026-10"]);
  });
});

describe("list_trips", () => {
  it("riboja eilučių skaičių ir rikiuoja pagal pelną", async () => {
    const result = await run("list_trips", { ...noFilter, sort: "profit_asc", limit: 1 });
    expect(result.is_viso_reisu).toBe(3);
    expect((result.reisai as { numeris: string }[]).map((row) => row.numeris)).toEqual(["B"]);
  });
});

describe("payments", () => {
  it("vėluojanti sąskaita: išrašyta 09-01, terminas 30 d., šiandien 10-23", async () => {
    const result = await run("payments", { ...noFilter, limit: null });
    expect(result.veluojanciu_saskaitu).toBe(1);
    expect(result.veluojancios).toEqual([expect.objectContaining({ numeris: "C", busena: "Vėluoja 22 d." })]);
  });
});

describe("trucks ir company_settings", () => {
  it("furos dokumentų įspėjimas ir paros savikaina", async () => {
    const result = await run("trucks", { plate: "nnn888" });
    expect(result.furos).toEqual([expect.objectContaining({
      fura: "NNN 888",
      paros_savikaina: euro(100),
      ispejimai: ["Draudimas – po 7 d."],
    })]);
  });

  it("minimali marža ir išjungti dienpinigiai", async () => {
    const result = await run("company_settings", {});
    expect(result.minimali_marza).toBe("12,0 %");
    expect(result.dienpinigiai_pagal_salis).toMatch(/išjungta/);
  });
});

describe("telematika", () => {
  const period = { from: "2026-10-01", to: "2026-10-23" };

  it("actual_costs: rida, sąnaudos ir kuro kaina iš to paties skaičiavimo kaip Analizė", async () => {
    const result = await run("actual_costs", { ...period, plate: null });
    expect(result.furos).toEqual([expect.objectContaining({
      fura: "NNN 888",
      km: 1000,
      sanaudos_l_100km: "32,0",
      // 480 € / 300 l
      kuro_kaina_uz_l: "1,600 €",
      dyzelinas: euro(480),
      keliai: euro(50),
      is_viso_be_kitu: euro(530),
    })]);
  });

  it("fuel_prices: pigiausia šalis ir galimas sutaupymas", async () => {
    const result = await run("fuel_prices", { ...period, by: "country" });
    expect(result.parko_vidutine_kaina_uz_l).toBe("1,600 €");
    // Abi šalys po 1,60 €/l – sutaupyti nėra kur.
    expect(result.sutaupytume_jei_visur_pigiausia_salis).toBe(euro(0));
  });

  it("trip_plan_vs_actual: kuras 480 € vietoj 450 €, pelnas 30 € mažesnis", async () => {
    const result = await run("trip_plan_vs_actual", { trip_number: "lt77" });
    expect(result.eilutes).toEqual(expect.arrayContaining([
      { kas: "kuras", planas: euro(450), faktas: euro(480), skirtumas: euro(30) },
    ]));
    expect(result.sanaudos_l_100km).toEqual({ planas: "30,0", faktas: "32,0" });
  });

  it("be Telematikos – aiškus atsakymas, ne klaida", async () => {
    expect(await run("actual_costs", { ...period, plate: null }, noTelematics)).toEqual({
      klaida: "Telematika šiai įmonei neprijungta – faktinių kaštų nėra.",
    });
  });

  it("nežinomas reisas", async () => {
    expect(await run("trip_plan_vs_actual", { trip_number: "X1" })).toEqual({ klaida: "Reiso „X1“ nėra." });
  });
});

describe("klaidos grąžinamos modeliui, ne metamos", () => {
  it("bloga data", async () => {
    expect(await run("get_summary", { ...noFilter, from: "spalis" })).toEqual({ klaida: "from turi būti data formatu YYYY-MM-DD." });
  });

  it("nežinomas įrankis ir sugadintas JSON", async () => {
    expect(await run("drop_table", {})).toEqual({ klaida: "Nežinomas įrankis: drop_table" });
    expect(await runAssistantTool("get_summary", "{", context)).toEqual({ klaida: "Argumentai nėra tinkamas JSON." });
  });

  it("nepasiekiamas šaltinis", async () => {
    const broken: AssistantContext = { ...context, telematics: async () => { throw new Error("timeout"); } };
    expect(await run("fuel_prices", { from: null, to: null, by: "country" }, broken)).toEqual({
      klaida: "Nepavyko gauti duomenų – šaltinis šiuo metu nepasiekiamas.",
    });
  });
});

it("griežtiems įrankiams visi laukai privalomi", () => {
  for (const tool of ASSISTANT_TOOLS) {
    const parameters = tool.parameters as { properties: object; required: string[] };
    expect(parameters.required.sort()).toEqual(Object.keys(parameters.properties).sort());
  }
});