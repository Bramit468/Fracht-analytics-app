import { describe, expect, it } from "vitest";

import type { DailyDistance, Supply } from "./telematics-costs";
import { allocateTime, buildOrderTrips, parseOrderLegs, parseOrders, placeCity, placeQuery, type ImportTruck } from "./telematics-orders";

const H = 3_600_000;
const at = (value: string) => Date.parse(`${value.replace(" ", "T")}Z`);

describe("allocateTime", () => {
  it("persidengiantis laikas dalinamas po lygiai, todėl parų suma neviršija darbo laiko", () => {
    const result = allocateTime([
      { id: "a", truck: "t", start: at("2026-10-01 08:00:00"), end: at("2026-10-01 20:00:00") },
      { id: "b", truck: "t", start: at("2026-10-01 14:00:00"), end: at("2026-10-01 22:00:00") },
    ]);
    // 08–14 tik a (6 h), 14–20 abu (po 3 h), 20–22 tik b (2 h).
    expect(result.get("a")!.hours).toBeCloseTo(9);
    expect(result.get("b")!.hours).toBeCloseTo(5);
  });

  it("skirtingos furos viena kitai netrukdo", () => {
    const result = allocateTime([
      { id: "a", truck: "t1", start: at("2026-10-01 08:00:00"), end: at("2026-10-01 20:00:00") },
      { id: "b", truck: "t2", start: at("2026-10-01 08:00:00"), end: at("2026-10-01 20:00:00") },
    ]);
    expect(result.get("b")!.hours).toBeCloseTo(12);
  });

  it("valandos išskaidomos per vidurnaktį", () => {
    const result = allocateTime([{ id: "a", truck: "t", start: at("2026-10-01 20:00:00"), end: at("2026-10-02 06:00:00") }]);
    expect(Object.fromEntries(result.get("a")!.byDay)).toEqual({ "2026-10-01": 4, "2026-10-02": 6 });
  });

  it("nulinės trukmės užsakymas gauna 0 valandų", () => {
    const result = allocateTime([{ id: "a", truck: "t", start: 5 * H, end: 5 * H }]);
    expect(result.get("a")!.hours).toBe(0);
  });
});

describe("placeCity", () => {
  it("ima miestą ir šalį", () => {
    expect(placeCity("Tekniska Verken Linköping, SWE, Linköping, 582 75, Gärstadsvägen 5")).toBe("Linköping, SWE");
  });

  it("PTV paieškai – be įmonės pavadinimo", () => {
    expect(placeQuery("Kund NordicNest AB, SWE, Kalmar, 394 70, ")).toBe("394 70 Kalmar, SWE");
  });

  it("be šalies grąžina pirmą dalį", () => {
    expect(placeCity("Kaunas")).toBe("Kaunas");
  });
});

const TRUCKS: ImportTruck[] = [{ id: "t1", plate: "MHE 763", fuel_norm_l_per_100km: 30 }];

function leg(orderId: string, start: string, end: string, km: number, extra: Record<string, unknown> = {}) {
  return {
    OrderId: Number(orderId), DateStart: start, DateEnd: end,
    StartPlace: "A, NOR, Lörenskog, 1470, X", EndPlace: "B, SWE, Jönköping, 553, Y",
    StartPointType: "Loading", EndPointType: "Unloading",
    Distance: km.toFixed(3), IsEmptyKm: "0", TruckPlates: "MHE 763", FuelConsumption: "0.000",
    ExternalCarrier: null, ...extra,
  };
}

const ORDERS = [
  { OrderId: "1", OrderNo: " SENO 1 ", TripClient: "UAB  Klientas", OrderPrice: 1200, AdditionalPaymentsEur: 50 },
  { OrderId: "2", OrderNo: "", TripClient: "Kitas", OrderPrice: 800, AdditionalPaymentsEur: 0 },
  { OrderId: "3", OrderNo: "N3", TripClient: "X", OrderPrice: 0, AdditionalPaymentsEur: 0 },
];

function build(legs: unknown[], extra: { daily?: DailyDistance[]; supplies?: Supply[] } = {}) {
  return buildOrderTrips({
    orders: parseOrders(ORDERS),
    legs: parseOrderLegs(legs),
    trucks: TRUCKS,
    daily: extra.daily ?? [],
    supplies: extra.supplies ?? [],
    now: "2026-10-23 12:00:00",
  });
}

describe("buildOrderTrips", () => {
  it("užsakymas tampa reisu: kaina su priemokomis, km, paros, sustojimai", () => {
    const { trips } = build([
      leg("1", "2026-10-21 09:00:00", "2026-10-21 21:00:00", 476, { IsEmptyKm: "1", StartPointType: null, EndPointType: null }),
      leg("1", "2026-10-21 21:00:00", "2026-10-22 09:00:00", 436),
    ]);
    expect(trips).toHaveLength(1);
    expect(trips[0].customer).toBe("UAB Klientas");
    expect(trips[0].trip).toMatchObject({
      trip_number: "SENO 1",
      origin: "Lörenskog, NOR",
      destination: "Jönköping, SWE",
      trip_date: "2026-10-21",
      days: 1,
      paid_km: 436,
      empty_km: 476,
      freight_price_cents: 125000,
      revenue_mode: "freight",
      telematika_order_id: "1",
      fuel_l_per_100km: 30,
    });
    expect(trips[0].legs).toEqual([{ country: "Nemokami", km: 912 }]);
    expect(trips[0].trip.stops!.map((stop) => stop.type)).toEqual(["loading", "unloading"]);
    expect(trips[0].notes).toContain("Kuro norma – iš furos kortelės.");
  });

  it("praleidžia vykstančius, neįkainotus, samdytus ir nežinomos furos užsakymus", () => {
    const { trips, skipped } = build([
      leg("1", "2026-10-23 08:00:00", "2026-10-23 18:00:00", 100),
      leg("3", "2026-10-20 08:00:00", "2026-10-20 18:00:00", 100),
      leg("2", "2026-10-20 08:00:00", "2026-10-20 18:00:00", 100, { ExternalCarrier: "UAB Vežėjas" }),
    ]);
    expect(trips).toHaveLength(0);
    expect(skipped.map((item) => item.reason).sort()).toEqual(["Dar vyksta.", "Kaina 0 € – dar neįkainotas.", "Vežė samdytas vežėjas."]);
    expect(build([leg("2", "2026-10-20 08:00:00", "2026-10-20 18:00:00", 100, { TruckPlates: "ZZZ 999" })]).skipped[0].reason).toBe("Furos ZZZ 999 nėra sąraše.");
  });

  it("be numerio reisas gauna Telematikos ID", () => {
    expect(build([leg("2", "2026-10-20 08:00:00", "2026-10-20 18:00:00", 100)]).trips[0].trip.trip_number).toBe("TLM 2");
  });

  it("tos dienos kelių mokestis dalinamas užsakymams pagal valandas", () => {
    const { trips, unassignedTollCents } = build(
      [leg("1", "2026-10-20 00:00:00", "2026-10-20 18:00:00", 100), leg("2", "2026-10-20 18:00:00", "2026-10-21 00:00:00", 100)],
      {
        supplies: [
          { plate: "MHE763", date: "2026-10-20", kind: "toll", quantity: null, costCents: 8000, country: "NOR" },
          // Kitą dieną fura užsakymų nevežė – mokestis nepriskiriamas, bet nedingsta.
          { plate: "MHE763", date: "2026-10-21", kind: "toll", quantity: null, costCents: 500, country: "NOR" },
        ],
      },
    );
    const tolls = Object.fromEntries(trips.map((trip) => [trip.orderId, trip.trip.bridges_cents]));
    expect(tolls).toEqual({ 1: 6000, 2: 2000 });
    expect(unassignedTollCents).toBe(500);
  });

  it("be atkarpų km – PTV adresai ir įvertis iš paros ridos, ne daugiau nei užsakymo valandų dalis", () => {
    const { trips } = build([leg("2", "2026-10-20 06:00:00", "2026-10-20 18:00:00", 0)], {
      daily: [{ plate: "MHE 763", date: "2026-10-20", km: 800, fuelL: 240 }],
    });
    // Užsakymas truko 12 h iš 24 → pusė dienos ridos.
    expect(trips[0].trip.paid_km).toBe(400);
    expect(trips[0].kmAddresses).toEqual(["X, 1470 Lörenskog, NOR", "Y, 553 Jönköping, SWE"]);
    expect(trips[0].notes[0]).toMatch(/PTV/);
  });

  it("kai km yra, PTV nereikia", () => {
    expect(build([leg("2", "2026-10-20 06:00:00", "2026-10-20 18:00:00", 120)]).trips[0].kmAddresses).toBeNull();
  });
});
