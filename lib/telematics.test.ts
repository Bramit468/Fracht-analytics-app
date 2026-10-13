import { describe, expect, it } from "vitest";
import { liveTrucks, parseSnapshots } from "./telematics";

// Sutrumpinta tikro atsakymo kopija. Vairuotojų laukai išimti sąmoningai:
// reiso kaštams nereikalingi, o tai asmens duomenys.
const RESPONSE = [
  {
    ObjectId: "1226", Number: "mle 240", VectorSpeed: "81", Country: "SWE",
    X: "18.063240", Y: "59.334591",
    GpsTime: "2026-09-22 19:06:51", Ignition: "1",
    Odometer: "485191.595", FuelConsumption: "157963.000", FuelLevel: "64.80",
  },
  {
    // Fura be kuro daviklio — kuro laukai tušti.
    ObjectId: "1355", Number: "LVI 413", Country: "LTU", X: "0", Y: "0",
    GpsTime: "2026-09-22 18:00:00", Ignition: "0",
    Odometer: "56792.026", FuelConsumption: null, FuelLevel: null,
  },
  {
    // Seniai neveikiantis objektas: paskutiniai duomenys prieš ketverius metus.
    ObjectId: "747", Number: "LNO 402", Country: "LTU",
    GpsTime: "2021-01-14 04:53:10", Ignition: "0",
    Odometer: "35368.360", FuelConsumption: "9524.500", FuelLevel: "89.60",
  },
  {
    // Tas pats objektas atsakyme grąžinamas dukart.
    ObjectId: "1764", Number: "NEJ 081", Country: "LTU",
    GpsTime: "2026-09-22 12:35:39", Ignition: "0",
    Odometer: "531909.210", FuelConsumption: "142374.500", FuelLevel: "13.60",
  },
  {
    ObjectId: "1764", Number: "NEJ 081", Country: "LTU",
    GpsTime: "2026-09-22 12:35:39", Ignition: "0",
    Odometer: "531909.210", FuelConsumption: "142374.500", FuelLevel: "13.60",
  },
];

describe("parseSnapshots", () => {
  it("nuskaito eilutę ir suvienodina numerį", () => {
    expect(parseSnapshots(RESPONSE)[0]).toEqual({
      objectId: "1226",
      plate: "MLE 240",
      gpsTime: "2026-09-22 19:06:51",
      country: "SWE",
      ignition: true,
      latitude: 59.334591,
      longitude: 18.06324,
      speedKmh: 81,
      odometerKm: 485191.595,
      fuelL: 157963,
    });
  });

  it("furą be kuro daviklio palieka, o kurą pažymi kaip nežinomą", () => {
    const fura = parseSnapshots(RESPONSE).find((s) => s.plate === "LVI 413");

    // Praleidus tokią eilutę dingtų ir jos rida, o be ridos nebūtų reiso.
    expect(fura).toMatchObject({ odometerKm: 56792.026, fuelL: null });
  });

  it("0,0 ir trūkstamos koordinatės yra nežinoma vieta, ne taškas jūroje", () => {
    const rows = parseSnapshots(RESPONSE);

    expect(rows.find((s) => s.plate === "LVI 413")).toMatchObject({ latitude: null, longitude: null });
    expect(rows.find((s) => s.plate === "NEJ 081")).toMatchObject({ latitude: null, longitude: null, speedKmh: null });
  });

  it("dubliuotą objektą įrašo vieną kartą", () => {
    expect(parseSnapshots(RESPONSE).filter((s) => s.objectId === "1764")).toHaveLength(1);
  });

  it("atmeta seniai nesisiekusius objektus", () => {
    const svieži = parseSnapshots(RESPONSE, "2026-09-01 00:00:00");

    expect(svieži.map((s) => s.plate)).toEqual(["MLE 240", "LVI 413", "NEJ 081"]);
  });

  it("neatpažįstamą atsakymą praneša klaida, o ne tyliai grąžina tuščią sąrašą", () => {
    expect(() => parseSnapshots({ error: "invalid token" })).toThrow();
  });
});

describe("liveTrucks", () => {
  const rows = parseSnapshots([
    ...RESPONSE,
    // Senesnė tos pačios furos eilutė kitu objektu: turi laimėti naujesnė.
    { ObjectId: "9", Number: "MLE240", GpsTime: "2026-09-22 10:00:00", Ignition: "0", X: "25.0", Y: "54.0" },
    { ObjectId: "10", Number: "LSE 728", GpsTime: "2026-09-22 19:00:00", Ignition: "1", VectorSpeed: "0", X: "23.9", Y: "54.9" },
  ]);

  it("rodo tik sąrašo furas ir ima naujausią vietą", () => {
    const { trucks } = liveTrucks(rows, ["MLE 240", "LSE728"]);

    expect(trucks).toEqual([
      { plate: "MLE 240", latitude: 59.334591, longitude: 18.06324, country: "SWE", moving: true, state: "Važiuoja 81 km/h", gpsTime: "2026-09-22 19:06:51" },
      { plate: "LSE728", latitude: 54.9, longitude: 23.9, country: null, moving: false, state: "Stovi, variklis įjungtas", gpsTime: "2026-09-22 19:00:00" },
    ]);
  });

  it("furos be vietos nedingsta tyliai", () => {
    expect(liveTrucks(rows, ["LVI 413", "AAA 111"]).withoutPosition).toEqual(["LVI 413", "AAA 111"]);
  });
});
