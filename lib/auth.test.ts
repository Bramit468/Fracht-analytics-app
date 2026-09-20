import { describe, expect, it } from "vitest";

import { getAuthRedirect } from "./auth";

describe("getAuthRedirect", () => {
  it("sends signed-out visitors to login", () => {
    expect(getAuthRedirect("/", false)).toBe("/login");
    expect(getAuthRedirect("/trips/new", false)).toBe("/login");
  });

  it("keeps authentication routes available while signed out", () => {
    expect(getAuthRedirect("/login", false)).toBeNull();
    expect(getAuthRedirect("/auth/callback", false)).toBeNull();
  });

  it("keeps business routes available after authentication", () => {
    expect(getAuthRedirect("/trips", true)).toBeNull();
  });

  it("moves an authenticated user away from the login page", () => {
    expect(getAuthRedirect("/login", true)).toBe("/");
  });
});
