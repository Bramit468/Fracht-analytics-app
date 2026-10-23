import { describe, it, expect, vi } from "vitest";
import { fetchAllRows, saveTrip } from "./trips";
import type { TripInsert } from "../types/trip";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("./supabase", () => ({ getSupabaseClient: () => ({ rpc }) }));
describe("saveTrip", () => {
  it("returns persisted leg ids from the database transaction", async () => {
    const saved = { id: "trip-id", legs: [{ id: "real-leg-id", trip_id: "trip-id", country: "LT", km: 10 }] };
    rpc.mockResolvedValueOnce({ data: saved, error: null });
    expect(await saveTrip({} as TripInsert, [{ country: "LT", km: 10 }])).toEqual(saved);
    expect(rpc).toHaveBeenCalledWith("save_trip_with_legs", { trip_data: {}, legs_data: [{ country: "LT", km: 10 }] });
  });
  it("propagates a failed transaction instead of returning success", async () => {
    const error = { message: "unknown country" };
    rpc.mockResolvedValueOnce({ data: null, error });
    await expect(saveTrip({} as TripInsert, [])).rejects.toEqual(error);
  });
});
describe("fetchAllRows", () => {
  it("keeps paging past the 1000-row cap until a short page", async () => {
    const all = Array.from({ length: 2345 }, (_, i) => i);
    const page = vi.fn(async (from: number, to: number) => ({ data: all.slice(from, to + 1), error: null }));
    expect(await fetchAllRows(page)).toEqual(all);
    expect(page.mock.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
  it("throws instead of returning a partial list", async () => {
    const error = { message: "boom" };
    const page = vi.fn(async (from: number) => (from ? { data: null, error } : { data: Array(1000).fill(0), error: null }));
    await expect(fetchAllRows(page)).rejects.toEqual(error);
  });
});
