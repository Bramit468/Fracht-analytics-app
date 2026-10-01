import { describe, expect, it } from "vitest";

import {
  MAX_STOPS,
  addStop,
  buildWaypoints,
  countStopsByType,
  moveStop,
  normalizeStops,
  removeStop,
  routedStops,
  stopLetter,
  stopsFromStored,
  toStoredStops,
  updateStop,
  type Stop,
} from "./stops";

const A: Stop = { id: 0, type: "loading", address: "Panevėžys", point: "55.7,24.3" };
const B: Stop = { id: 1, type: "unloading", address: "Oslas", point: "" };

describe("sustojimų sąrašas", () => {
  it("papildomas sustojimas įterpiamas prieš iškrovimą", () => {
    const stops = addStop([A, B], 2, "customs");
    expect(stops.map((stop) => stop.type)).toEqual(["loading", "customs", "unloading"]);
  });

  it("pakrovimo ir iškrovimo tipų negalima įterpti viduryje", () => {
    expect(addStop([A, B], 2, "loading")[1].type).toBe("other");
  });

  it("neviršija ribos", () => {
    let stops = [A, B];
    for (let id = 2; id < MAX_STOPS + 3; id++) stops = addStop(stops, id);
    expect(stops).toHaveLength(MAX_STOPS);
  });

  it("pirmo ir paskutinio nepašalina", () => {
    const stops = addStop([A, B], 2);
    expect(removeStop(stops, 0)).toBe(stops);
    expect(removeStop(stops, 2)).toBe(stops);
    expect(removeStop(stops, 1)).toHaveLength(2);
  });

  it("perkelia tik viduriniuosius", () => {
    const stops = addStop(addStop([A, B], 2, "customs"), 3, "cmr_handover");
    expect(moveStop(stops, 1, 1).map((stop) => stop.id)).toEqual([0, 3, 2, 1]);
    expect(moveStop(stops, 1, -1)).toBe(stops);
    expect(moveStop(stops, 2, 1)).toBe(stops);
  });

  it("normalizuoja: pirmas pakrovimas, paskutinis iškrovimas", () => {
    const stops = normalizeStops([{ ...A, type: "customs" }, { ...A, id: 5, type: "loading" }, { ...B, type: "other" }]);
    expect(stops.map((stop) => stop.type)).toEqual(["loading", "other", "unloading"]);
  });

  it("adreso keitimas nekeičia kitų laukų", () => {
    expect(updateStop([A, B], 1, { address: "Bergenas" })[1]).toEqual({ ...B, address: "Bergenas" });
  });

  it("raidės A, B, C", () => {
    expect([0, 1, 2].map(stopLetter)).toEqual(["A", "B", "C"]);
  });
});

describe("išsaugojimas", () => {
  it("skaičiuoja pagal tipą – kad skaičiavimas vėliau galėtų jais naudotis", () => {
    const stops = addStop(addStop([A, B], 2, "customs"), 3, "customs");
    const counts = countStopsByType(stops);
    expect(counts.customs).toBe(2);
    expect(counts.loading).toBe(1);
    expect(counts.cmr_handover).toBe(0);
  });

  it("apvyniojimas į DB ir atgal nepraranda tipų", () => {
    const stops = addStop([A, B], 2, "cmr_handover");
    expect(stopsFromStored(toStoredStops(stops)).map((stop) => stop.type)).toEqual(["loading", "cmr_handover", "unloading"]);
  });

  it("senas reisas be sustojimų gauna pakrovimą ir iškrovimą iš pradžios ir pabaigos", () => {
    const stops = stopsFromStored(null, "Kaunas", "Berlynas");
    expect(stops).toMatchObject([{ type: "loading", address: "Kaunas" }, { type: "unloading", address: "Berlynas" }]);
  });

  it("sugadinti įrašai nesukelia klaidos", () => {
    expect(stopsFromStored([null, "x", { type: "nežinomas" }], "A", "B")).toHaveLength(2);
  });
});

describe("buildWaypoints", () => {
  const stops = updateStop(addStop([A, B], 2, "customs"), 1, { address: "Muitinė" });

  it("tuščio papildomo sustojimo į maršrutą neįtraukia", () => {
    expect(routedStops(addStop([A, B], 2))).toHaveLength(2);
    expect(routedStops(stops)).toHaveLength(3);
  });

  it("tarpiniai taškai eina prie savo ruožo", () => {
    const waypoints = buildWaypoints(stops, [
      { latitude: 1, longitude: 1, leg: 1 },
      { latitude: 2, longitude: 2, leg: 0 },
    ]);
    expect(waypoints.map((point) => (point.kind === "stop" ? "S" : `V${point.latitude}`))).toEqual(["S", "V2", "S", "V1", "S"]);
  });

  it("pasenęs ruožo numeris prisegamas prie paskutinio ruožo", () => {
    const waypoints = buildWaypoints([A, B], [{ latitude: 9, longitude: 9, leg: 4 }]);
    expect(waypoints).toHaveLength(3);
    expect(waypoints[1]).toMatchObject({ kind: "via", latitude: 9 });
  });
});
