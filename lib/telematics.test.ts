import { describe, expect, it } from "vitest";
import { parseSnapshots } from "./telematics";

// Sutrumpinta tikro atsakymo kopija. Vairuotojų laukai išimti sąmoningai:
// reiso kaštams nereikalingi, o tai asmens duomenys.
const RESPONSE = [
  {
    ObjectId: "1226", Number: "mle 240", VectorSpeed: "81", Country: "SWE",
    GpsTime: "2026-09-22 19:06:51", Ignition: "1",
    Odometer: "485191.595", FuelConsumption: "157963.000", FuelLevel: "64.80",
  },
  {
    // Fura be kuro daviklio — kuro laukai tušti.
    ObjectId: "1355", Number: "LVI 413", Country: "LTU",
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
      odometerKm: 485191.595,
      fuelL: 157963,
    });
  });

  it("furą be kuro daviklio palieka, o kurą pažymi kaip nežinomą", () => {
    const fura = parseSnapshots(RESPONSE).find((s) => s.plate === "LVI 413");

    // Praleidus tokią eilutę dingtų ir jos rida, o be ridos nebūtų reiso.
    expect(fura).toMatchObject({ odometerKm: 56792.026, fuelL: null });
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
