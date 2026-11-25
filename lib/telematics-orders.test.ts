import { describe, expect, it } from "vitest";

import { perDiemNormCents } from "./per-diem-norms";
import type { DailyDistance, Supply } from "./telematics-costs";
import { allocateTime, buildOrderTrips, carriedEmptyKm, editedByHand, idleDaysBeforeLoading, idleWeekendDaysInLoad, importChanges, importSnapshot, parseOrderLegs, parseOrders, placeCity, placeQuery, type ImportTruck } from "./telematics-orders";

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

describe("carriedEmptyKm", () => {
  const order = (orderId: string, start: string, end: string, odometer: [number | null, number | null]) =>
    ({ orderId, plate: "MHE 763", start, end, odometerStart: odometer[0], odometerEnd: odometer[1] });
  const day = (date: string, km: number): DailyDistance => ({ plate: "MHE763", date, km, fuelL: null });

  it("odometras – tikslu: kito pradžia − ankstesnio pabaiga", () => {
    const result = carriedEmptyKm({
      orders: [
        order("a", "2026-10-05 06:00:00", "2026-10-05 12:00:00", [100_000, 100_300]),
        order("b", "2026-10-07 08:00:00", "2026-10-07 18:00:00", [100_712, 101_002]),
      ],
      daily: [day("2026-10-05", 300), day("2026-10-06", 400), day("2026-10-07", 302)],
    });
    expect(Object.fromEntries(result.carried)).toEqual({ b: 412 });
  });

  it("odometras netikėtinas (daugiau nei nuvažiuota) ar nežinomas – nieko; paros ridos likutis kroviniams neskirstomas", () => {
    const daily = [day("2026-10-05", 300), day("2026-10-06", 400), day("2026-10-07", 290)];
    expect(carriedEmptyKm({
      orders: [order("a", "2026-10-05 06:00:00", "2026-10-05 12:00:00", [100_000, 100_300]), order("b", "2026-10-07 08:00:00", "2026-10-07 18:00:00", [105_000, 105_290])],
      daily,
    }).carried.size).toBe(0);
    // Diena be užsakymo (10-06, 400 km) – „važinėjo šiaip“, ne kroviniui.
    expect(carriedEmptyKm({
      orders: [order("a", "2026-10-05 06:00:00", "2026-10-05 12:00:00", [null, null]), order("b", "2026-10-07 08:00:00", "2026-10-07 18:00:00", [null, null])],
      daily,
    }).carried.size).toBe(0);
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
  // Telematikos atstumas – tik tuščios atkarpos km (pakrautų km nėra), kaip MHE 763 10-07.
  { OrderId: "4", OrderNo: "1015210017255", TripClient: "X", OrderPrice: 538.75, AdditionalPaymentsEur: 0, TotalTripDistance: "12.000" },
];

function build(legs: unknown[], extra: { daily?: DailyDistance[]; supplies?: Supply[]; perDiemPercent?: number; now?: string } = {}) {
  return buildOrderTrips({
    orders: parseOrders(ORDERS),
    legs: parseOrderLegs(legs),
    trucks: TRUCKS,
    daily: extra.daily ?? [],
    supplies: extra.supplies ?? [],
    now: extra.now ?? "2026-10-23 12:00:00",
    perDiemPercent: extra.perDiemPercent ?? null,
  });
}

describe("idleDaysBeforeLoading", () => {
  const km = (days: Record<string, number>) => (date: string) => days[date];

  it("savaitgalis – visada, darbo diena – tik stovint (< 50 km), pakrovimo diena – niekada", () => {
    // 2026-10-23 penktadienis, 10-26 pirmadienis (MHE 763: S 182 km, bet savaitgalis).
    expect(idleDaysBeforeLoading("2026-10-23", "2026-10-26", km({ "2026-10-23": 511, "2026-10-24": 0, "2026-10-25": 182 }))).toEqual(["2026-10-24", "2026-10-25"]);
    expect(idleDaysBeforeLoading("2026-10-20", "2026-10-22", km({ "2026-10-20": 12, "2026-10-21": 300 }))).toEqual(["2026-10-20"]);
    expect(idleDaysBeforeLoading("2026-10-24", "2026-10-24", km({}))).toEqual([]);
  });

  it("be paros ridos darbo diena paliekama", () => {
    expect(idleDaysBeforeLoading("2026-10-20", "2026-10-22", km({}))).toEqual([]);
  });
});

describe("idleWeekendDaysInLoad", () => {
  const km = (days: Record<string, number>) => (date: string) => days[date];

  it("savaitgalis, kai pakrauta fura stovėjo; važiavusi ar be ridos – lieka; pakrovimo diena – niekada", () => {
    // MHE 763 10-29: pakrauta pn 10-30, š 0 km, s 90 km, iškrauta pr.
    expect(idleWeekendDaysInLoad("2026-10-30", "2026-11-02", km({ "2026-10-31": 0, "2026-11-01": 90 }))).toEqual(["2026-10-31"]);
    expect(idleWeekendDaysInLoad("2026-10-31", "2026-11-02", km({ "2026-10-31": 0, "2026-11-01": 0 }))).toEqual(["2026-11-01"]);
    expect(idleWeekendDaysInLoad("2026-10-30", "2026-11-02", km({}))).toEqual([]);
  });
});

describe("buildOrderTrips: paros ridos likutis neskaičiuojamas dukart", () => {
  const day = (date: string, value: number): DailyDistance => ({ plate: "MHE 763", date, km: value, fuelL: null });
  const legs = [
    leg("4", "2026-10-07 19:00:00", "2026-10-08 12:59:00", 12, { IsEmptyKm: "1", StartPointType: null, EndPointType: null }),
    leg("4", "2026-10-08 13:00:00", "2026-10-09 10:00:00", 0),
  ];
  const daily = [day("2026-10-07", 350), day("2026-10-08", 359), day("2026-10-09", 208)];

  it("pakrautų km nėra, o TotalTripDistance – tik tuščia atkarpa: atstumas nežinomas, likučio nėra", () => {
    // Anksčiau: 917 km ridos − 12 km „užsakymo“ = +905 tuščių km, o apmokami km dar kartą iš tos pačios ridos.
    const [trip] = build(legs, { now: "2026-11-01 00:00:00", daily }).trips;
    expect(trip.trip.empty_km).toBe(12);
    expect(trip.kmAddresses).not.toBeNull();
  });

});

describe("buildOrderTrips: Telematikos mėnesio riba", () => {
  const day = (date: string, value: number): DailyDistance => ({ plate: "MHE 763", date, km: value, fuelL: null });

  it("rida ir keliai iki pirmo furos užsakymo duomenyse niekam nepriskiriami; tas užsakymas pažymimas", () => {
    const toll: Supply = { plate: "MHE 763", date: "2026-10-21", kind: "toll", quantity: null, costCents: 700, country: "SWE" };
    const { trips } = build([
      leg("1", "2026-10-22 08:00:00", "2026-10-22 18:00:00", 300),
      leg("2", "2026-10-23 08:00:00", "2026-10-23 18:00:00", 300),
    ], { now: "2026-11-01 00:00:00", daily: [day("2026-10-20", 500), day("2026-10-21", 500), day("2026-10-22", 300), day("2026-10-23", 300)], supplies: [toll] });
    const byOrder = Object.fromEntries(trips.map((trip) => [trip.orderId, trip]));
    // 10-20 ir 10-21 – prieš pirmą furos užsakymą: ankstesnis iškrito iš srauto.
    expect(byOrder[1].trip.empty_km).toBe(0);
    expect(byOrder[1].trip.bridges_cents).toBe(0);
    expect(byOrder[1].feedEdge).toBe(true);
    expect(byOrder[2].feedEdge).toBe(false);
  });
});

describe("buildOrderTrips", () => {
  it("prastova prieš pakrovimą kroviniui laiko neneša (MHE 763, 10-23)", () => {
    const day = (date: string, value: number): DailyDistance => ({ plate: "MHE 763", date, km: value, fuelL: null });
    const { trips } = build([
      leg("1", "2026-10-23 08:00:00", "2026-10-26 12:46:00", 689, { IsEmptyKm: "1", StartPointType: null, EndPointType: null }),
      leg("1", "2026-10-26 12:46:00", "2026-10-27 08:00:00", 436),
    ], { now: "2026-11-01 00:00:00", daily: [day("2026-10-23", 511), day("2026-10-24", 0), day("2026-10-25", 182), day("2026-10-26", 487), day("2026-10-27", 323)] });
    // 96 h − 48 h (šeštadienis, sekmadienis) = 2 paros; km ir kuras lieka.
    expect(trips[0].trip).toMatchObject({ days: 2, trip_date: "2026-10-23", paid_km: 436 });
    expect(trips[0].notes).toContain("Neskaičiuota prastova: 2026-10-24, 2026-10-25 (2 d.).");
  });

  it("stovėjimas nuo pat iškrovimo – reiso data pasislenka", () => {
    const { trips } = build([
      leg("1", "2026-10-24 08:00:00", "2026-10-26 08:00:00", 300, { IsEmptyKm: "1", StartPointType: null, EndPointType: null }),
      leg("1", "2026-10-26 08:00:00", "2026-10-26 20:00:00", 436),
    ], { now: "2026-11-01 00:00:00" });
    // Š–S (40 h) išmesta; lieka pirmadienio 00–08 privažiavimas + 12 h krovinio = 20 h.
    expect(trips[0].trip).toMatchObject({ days: 0.833, trip_date: "2026-10-26" });
  });

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

  it("keliai dienomis be užsakymo – kitam tos furos užsakymui per 3 dienas, toliau – nepriskirti", () => {
    const toll = (date: string, costCents: number): Supply => ({ plate: "MHE 763", date, kind: "toll", quantity: null, costCents, country: "SWE" });
    const { trips, unassignedTollCents } = build(
      [leg("1", "2026-10-15 08:00:00", "2026-10-15 18:00:00", 100), leg("2", "2026-10-21 08:00:00", "2026-10-21 18:00:00", 100)],
      { supplies: [toll("2026-10-16", 900), toll("2026-10-19", 300), toll("2026-10-20", 200)] },
    );
    const byOrder = Object.fromEntries(trips.map((trip) => [trip.orderId, trip]));
    // 10-16 → kitas užsakymas tik 10-21 (5 d.) – nepriskirta; 10-19 ir 10-20 – užsakymui 2.
    expect(byOrder[2].trip.bridges_cents).toBe(500);
    expect(byOrder[1].trip.bridges_cents).toBe(0);
    expect(unassignedTollCents).toBe(900);
    expect(byOrder[2].notes).toContain("Keliai 5,00 € – pervažiavimas prieš užsakymą (dienos be užsakymo).");
  });

  it("diena be užsakymo – ne kroviniui (rida rodoma furos ataskaitoje); norma iš paties užsakymo km", () => {
    const day = (date: string, km: number): DailyDistance => ({ plate: "MHE 763", date, km, fuelL: null });
    const { trips } = build(
      [
        leg("1", "2026-10-15 08:00:00", "2026-10-15 18:00:00", 300, { FuelConsumption: "90.000" }),
        // 10-16 fura važiavo be užsakymo (280 km), 10-17 – užsakymas 2.
        leg("2", "2026-10-17 08:00:00", "2026-10-17 18:00:00", 290),
      ],
      { daily: [day("2026-10-15", 300), day("2026-10-16", 280), day("2026-10-17", 290)] },
    );
    const byOrder = Object.fromEntries(trips.map((trip) => [trip.orderId, trip]));
    expect(byOrder[2].trip.empty_km).toBe(0);
    expect(byOrder[2].legs).toEqual([{ country: "Nemokami", km: 290 }]);
    expect(byOrder[1].trip.empty_km).toBe(0);
    // 90 l / 300 km – norma nesumažėja dėl pridėtų km.
    expect(byOrder[1].trip.fuel_l_per_100km).toBe(30);
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

describe("importChanges", () => {
  const built = {
    kmAddresses: null,
    trip: { trip_date: "2026-10-01", truck_id: "t1", days: 2.375, paid_km: 1200.5, empty_km: 80, freight_price_cents: 250_000, bridges_cents: 4_200 },
  } as unknown as Parameters<typeof importChanges>[1];
  const stored = { ...built.trip } as Parameters<typeof importChanges>[0];

  it("nieko nekeičia, kai sutampa (ir kai duomenų bazė grąžina skaičius tekstu)", () => {
    expect(importChanges(stored, built)).toEqual([]);
    expect(importChanges({ ...stored, days: "2.375" as unknown as number, paid_km: "1200.50" as unknown as number }, built)).toEqual([]);
  });

  it("išvardija pakitusius laukus", () => {
    expect(importChanges({ ...stored, freight_price_cents: 240_000, bridges_cents: 0, truck_id: "t2" }, built)).toEqual(["kaina", "fura", "keliai"]);
    expect(importChanges({ ...stored, days: 2 }, built)).toEqual(["datos"]);
  });

  it("PTV km nelygina su paros ridos įverčiu", () => {
    const withPtv = { ...built, kmAddresses: ["A", "B"] } as typeof built;
    expect(importChanges({ ...stored, paid_km: 1500 }, withPtv)).toEqual([]);
    expect(importChanges({ ...stored, paid_km: 1500 }, built)).toEqual(["km"]);
  });
});

describe("editedByHand", () => {
  const imported = { trip_date: "2026-10-01", truck_id: "t1", days: 2.375, paid_km: 1200.5, empty_km: 80, freight_price_cents: 250_000, bridges_cents: 4_200, per_diem_cents: 9_000 };

  it("nepataisytas – tuščia, ir kai skaičiai grąžinami tekstu", () => {
    expect(editedByHand(imported, importSnapshot(imported))).toEqual([]);
    expect(editedByHand({ ...imported, paid_km: "1200.50" as unknown as number }, importSnapshot(imported))).toEqual([]);
  });

  it("pataisytas ranka – išvardija laukus, km lyginami visada", () => {
    expect(editedByHand({ ...imported, freight_price_cents: 260_000, paid_km: 1300 }, importSnapshot(imported))).toEqual(["kaina", "km"]);
  });

  it("be kopijos (sena eilutė) – laikoma nepataisyta", () => {
    expect(editedByHand({ ...imported, freight_price_cents: 1 }, null)).toEqual([]);
  });

  it("kopija be dienpinigių lygi null, ne undefined", () => {
    expect(importSnapshot({ ...imported, per_diem_cents: undefined }).per_diem_cents).toBeNull();
  });
});

describe("buildOrderTrips: dienpinigiai", () => {
  const legs = [leg("1", "2026-10-21 09:00:00", "2026-10-22 09:00:00", 436)];

  it("be įmonės % – fiksuoti, kaip anksčiau", () => {
    expect(build(legs).trips[0].trip.per_diem_cents).toBeUndefined();
  });

  it("pagal pakrovimo ir iškrovimo šalis, pagal paras ir įmonės %", () => {
    const { trip } = build(legs, { perDiemPercent: 50 }).trips[0];
    // 24 h = 1 para; abi dienos – Norvegija ir Švedija, mokamas jų vidurkis.
    const day = Math.round(((perDiemNormCents("NO")! + perDiemNormCents("SE")!) / 2) * 0.5);
    expect(trip.per_diem_days).toEqual([{ countries: ["NO", "SE"], cents: day }]);
    expect(trip.per_diem_cents).toBe(day);
  });

  it("nežinomos šalies normos nespėja – lieka fiksuoti ir pasakoma", () => {
    const { trips } = build([leg("1", "2026-10-21 09:00:00", "2026-10-22 09:00:00", 436, { EndPlace: "B, USA, Austin, 1, Y" })], { perDiemPercent: 100 });
    expect(trips[0].trip.per_diem_cents).toBeUndefined();
    expect(trips[0].notes).toContain("Dienpinigiai fiksuoti: šaliai USA normos nėra.");
  });
});

describe("importChanges: dienpinigiai", () => {
  it("anksčiau be dienpinigių importuotas reisas laikomas pakitusiu", () => {
    const trip = { trip_date: "2026-10-01", truck_id: "t1", days: 1, paid_km: 1, empty_km: 0, freight_price_cents: 1, bridges_cents: 0 };
    const built = { kmAddresses: null, trip: { ...trip, per_diem_cents: 5_000 } } as unknown as Parameters<typeof importChanges>[1];
    expect(importChanges({ ...trip, per_diem_cents: null }, built)).toEqual(["dienpinigiai"]);
    expect(importChanges({ ...trip, per_diem_cents: 5_000 }, built)).toEqual([]);
  });
});
