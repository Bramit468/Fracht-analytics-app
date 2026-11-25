import { describe, expect, it } from "vitest";
import { buildVersionLabel } from "./build-version";

describe("buildVersionLabel", () => {
  it("ima PR numerį iš squash commit pavadinimo", () => {
    expect(buildVersionLabel("Importas: tušti km (#332)\n\n* detalės (#1)", "e9c3e17abcdef")).toBe("#332 (e9c3e17)");
  });
  it("be PR numerio – tik žymė; be diegimo – nieko", () => {
    expect(buildVersionLabel("Merge branch main", "e9c3e17abcdef")).toBe("e9c3e17");
    expect(buildVersionLabel(undefined, undefined)).toBeNull();
  });
});
