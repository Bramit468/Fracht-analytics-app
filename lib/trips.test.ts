import { describe, it, expect, vi } from "vitest";
import { saveTrip } from "./trips";
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
