import { describe, expect, it } from "vitest";

import { isTelematicsCompany } from "./telematics-access";

describe("isTelematicsCompany", () => {
  it("allows only the configured company", () => {
    expect(isTelematicsCompany("ABC-1", "abc-1")).toBe(true);
    expect(isTelematicsCompany("other", "abc-1")).toBe(false);
  });

  it("denies everyone when nothing is configured or the user has no company", () => {
    expect(isTelematicsCompany("abc-1", undefined)).toBe(false);
    expect(isTelematicsCompany("abc-1", " ")).toBe(false);
    expect(isTelematicsCompany(null, "abc-1")).toBe(false);
  });
});
