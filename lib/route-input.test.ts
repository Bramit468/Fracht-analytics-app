import { describe, expect, it } from "vitest";

import { parseRouteInput } from "./route-input";
import { MAX_STOPS } from "./stops";
import { MAX_VIA_POINTS } from "./via-points";

const A = { kind: "stop", address: "Kaunas", point: "54.9,23.9" };
const B = { kind: "stop", address: "Berlynas" };
const VIA = { kind: "via", latitude: 53, longitude: 20 };

describe("parseRouteInput", () => {
  it("priima sustojimus ir tarpinius taškus ta tvarka, kuria atėjo", () => {
    const input = parseRouteInput({ waypoints: [A, VIA, B], avoidFerries: true, departureAt: "2026-10-05T06:00:00.000Z", weights: { loadWeightKg: 20000 } });
    expect(input?.waypoints.map((point) => point.kind)).toEqual(["stop", "via", "stop"]);
    expect(input?.avoidFerries).toBe(true);
    expect(input?.departureAt).toBe("2026-10-05T06:00:00.000Z");
  });

  it("atmeta, kai pirmas ar paskutinis taškas nėra sustojimas", () => {
    expect(parseRouteInput({ waypoints: [VIA, A, B] })).toBeNull();
    expect(parseRouteInput({ waypoints: [A, B, VIA] })).toBeNull();
  });

  it("atmeta per trumpą, per ilgą ir sugadintą sąrašą", () => {
    expect(parseRouteInput({ waypoints: [A] })).toBeNull();
    expect(parseRouteInput({ waypoints: Array.from({ length: MAX_STOPS + MAX_VIA_POINTS + 1 }, () => A) })).toBeNull();
    expect(parseRouteInput({ waypoints: [A, null, B] })).toBeNull();
    expect(parseRouteInput({ waypoints: [A, { kind: "via", latitude: 99, longitude: 0 }, B] })).toBeNull();
    expect(parseRouteInput({ waypoints: [A, { kind: "stop" }, B] })).toBeNull();
    expect(parseRouteInput(null)).toBeNull();
    expect(parseRouteInput("x")).toBeNull();
  });

  it("nenurodyti laukai gauna saugias reikšmes", () => {
    const input = parseRouteInput({ waypoints: [A, B] });
    expect(input).toMatchObject({ avoidFerries: false, weights: {} });
    expect(input?.departureAt).toBeUndefined();
  });
});
