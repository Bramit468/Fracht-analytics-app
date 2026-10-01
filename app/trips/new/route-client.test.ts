import { afterEach, describe, expect, it, vi } from "vitest";

import { RouteClient } from "./route-client";
import type { RouteLookupInput } from "./route-core";

const INPUT: RouteLookupInput = {
  waypoints: [
    { kind: "stop", address: "Kaunas", point: "54.9,23.9" },
    { kind: "stop", address: "Berlynas", point: "52.5,13.4" },
  ],
  avoidFerries: false,
  weights: {},
};

const OK = { ok: true, km: 100 };

/** `fetch`, kuris atsako po `ms`, bet nutraukiamas, jei užklausa atšaukta. */
function slowFetch(ms: number, body: unknown = OK) {
  return vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(() => resolve(new Response(JSON.stringify(body))), ms);
    init?.signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("RouteClient", () => {
  it("antrą kartą tas pats taškų sąrašas atsakomas iš atminties", async () => {
    const fetchMock = slowFetch(0);
    vi.stubGlobal("fetch", fetchMock);
    const client = new RouteClient();

    const first = await client.lookup(INPUT);
    const second = await client.lookup(structuredClone(INPUT));

    expect(first?.cached).toBe(false);
    expect(second).toEqual({ result: OK, cached: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("kitoks taškų sąrašas – nauja užklausa", async () => {
    const fetchMock = slowFetch(0);
    vi.stubGlobal("fetch", fetchMock);
    const client = new RouteClient();

    await client.lookup(INPUT);
    await client.lookup({ ...INPUT, waypoints: [...INPUT.waypoints.slice(0, 1), { kind: "via", latitude: 53, longitude: 20 }, ...INPUT.waypoints.slice(1)] });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("nauja užklausa nutraukia ankstesnę, o ši grąžina null", async () => {
    const fetchMock = slowFetch(50);
    vi.stubGlobal("fetch", fetchMock);
    const client = new RouteClient();

    const older = client.lookup(INPUT);
    const newer = client.lookup({ ...INPUT, avoidFerries: true });

    expect(await older).toBeNull();
    expect(await newer).toMatchObject({ cached: false });
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
    expect((fetchMock.mock.calls[1][1] as RequestInit).signal?.aborted).toBe(false);
  });

  it("nesėkmingo atsakymo neprisimena", async () => {
    const fetchMock = slowFetch(0, { ok: false, message: "Nepavyko" });
    vi.stubGlobal("fetch", fetchMock);
    const client = new RouteClient();

    await client.lookup(INPUT);
    await client.lookup(INPUT);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cancel() nutraukia vykdomą užklausą", async () => {
    vi.stubGlobal("fetch", slowFetch(50));
    const client = new RouteClient();

    const pending = client.lookup(INPUT);
    client.cancel();

    expect(await pending).toBeNull();
  });

  it("atminties įrašas pasensta", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const fetchMock = slowFetch(0);
    vi.stubGlobal("fetch", fetchMock);
    const client = new RouteClient();

    await client.lookup(INPUT);
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    await client.lookup(INPUT);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
