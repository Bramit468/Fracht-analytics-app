import { describe, expect, it } from "vitest";
import { createRateLimiter, rateLimitHeaders } from "./rate-limit";

describe("createRateLimiter", () => {
  it("lets max requests through per sliding window, then frees a slot when the oldest leaves", () => {
    const check = createRateLimiter([{ max: 2, ms: 60_000 }]);
    expect(check("u", 0)).toMatchObject({ ok: true, remaining: 1 });
    expect(check("u", 10_000)).toMatchObject({ ok: true, remaining: 0 });
    expect(check("u", 30_000)).toMatchObject({ ok: false, remaining: 0, retryAfterS: 30 });
    // Atmesta užklausa langų nepildo: po 60 s nuo pirmos vėl galima.
    expect(check("u", 60_001).ok).toBe(true);
    expect(check("u", 60_002).ok).toBe(false);
  });

  it("counts users apart", () => {
    const check = createRateLimiter([{ max: 1, ms: 60_000 }]);
    expect(check("a", 0).ok).toBe(true);
    expect(check("b", 0).ok).toBe(true);
    expect(check("a", 1).ok).toBe(false);
  });

  it("enforces the daily window even when the minute one has room", () => {
    const check = createRateLimiter([{ max: 10, ms: 60_000 }, { max: 3, ms: 86_400_000 }]);
    for (const at of [0, 120_000, 240_000]) expect(check("u", at).ok).toBe(true);
    const denied = check("u", 360_000);
    expect(denied).toMatchObject({ ok: false, limit: 3 });
    expect(denied.retryAfterS).toBe(86_400 - 360);
  });

  it("reports the tighter window while allowed", () => {
    const check = createRateLimiter([{ max: 10, ms: 60_000 }, { max: 3, ms: 86_400_000 }]);
    expect(check("u", 0)).toMatchObject({ ok: true, limit: 3, remaining: 2 });
  });
});

describe("rateLimitHeaders", () => {
  it("adds Retry-After only when denied, reset in Unix seconds", () => {
    expect(rateLimitHeaders({ ok: true, limit: 60, remaining: 59, resetAt: 1_500, retryAfterS: 1 })).toEqual({
      "X-RateLimit-Limit": "60", "X-RateLimit-Remaining": "59", "X-RateLimit-Reset": "2",
    });
    expect(rateLimitHeaders({ ok: false, limit: 60, remaining: 0, resetAt: 61_000, retryAfterS: 30 })["Retry-After"]).toBe("30");
  });
});
