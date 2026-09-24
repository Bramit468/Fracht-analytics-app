import { describe, expect, it } from "vitest";

import {
  isAlreadyMember,
  normalizeEmail,
  parseInviteEmail,
  pendingInvitations,
  type CompanyInvitation,
  type CompanyMember,
} from "./invitations";

describe("normalizeEmail", () => {
  it("nuima tarpus ir didžiąsias raides", () => {
    expect(normalizeEmail("  Jonas.Mitrikas@Gmail.com ")).toBe("jonas.mitrikas@gmail.com");
  });
});

describe("parseInviteEmail", () => {
  it("priima tvarkingą adresą", () => {
    expect(parseInviteEmail("jonas@fracht.lt")).toEqual({
      ok: true,
      email: "jonas@fracht.lt",
    });
  });

  it("suvienodina didžiąsias raides", () => {
    // Auth adresą laiko mažosiomis, todėl kitaip pakvietimas nesuveiktų.
    expect(parseInviteEmail("Jonas@Fracht.LT")).toEqual({
      ok: true,
      email: "jonas@fracht.lt",
    });
  });

  it("neleidžia tuščio lauko", () => {
    expect(parseInviteEmail("   ")).toMatchObject({ ok: false });
  });

  it("neleidžia adreso be „@“", () => {
    expect(parseInviteEmail("jonas.fracht.lt")).toMatchObject({ ok: false });
  });

  it("neleidžia dviejų „@“", () => {
    expect(parseInviteEmail("jonas@fracht@lt")).toMatchObject({ ok: false });
  });

  it("neleidžia srities be taško", () => {
    expect(parseInviteEmail("jonas@fracht")).toMatchObject({ ok: false });
  });

  it("neleidžia tarpo viduryje", () => {
    expect(parseInviteEmail("jonas mitrikas@fracht.lt")).toMatchObject({ ok: false });
  });
});

describe("isAlreadyMember", () => {
  const members: CompanyMember[] = [
    {
      user_id: "1",
      email: "lukas@fracht.lt",
      role: "owner",
      created_at: "2026-09-01T10:00:00Z",
    },
  ];

  it("randa esamą narį nepaisant raidžių dydžio", () => {
    expect(isAlreadyMember(members, " Lukas@Fracht.lt ")).toBe(true);
  });

  it("naujo adreso neranda", () => {
    expect(isAlreadyMember(members, "jonas@fracht.lt")).toBe(false);
  });
});

describe("pendingInvitations", () => {
  const rows: CompanyInvitation[] = [
    { email: "senas@fracht.lt", invited_at: "2026-09-01T10:00:00Z", accepted_at: null },
    {
      email: "jau@fracht.lt",
      invited_at: "2026-09-02T10:00:00Z",
      accepted_at: "2026-09-03T08:00:00Z",
    },
    { email: "naujas@fracht.lt", invited_at: "2026-09-20T10:00:00Z", accepted_at: null },
  ];

  it("palieka tik laukiančius", () => {
    // Priėmusieji jau matomi tarp narių, todėl sąraše kartotųsi.
    expect(pendingInvitations(rows).map((row) => row.email)).toEqual([
      "naujas@fracht.lt",
      "senas@fracht.lt",
    ]);
  });

  it("tuščio sąrašo nekeičia", () => {
    expect(pendingInvitations([])).toEqual([]);
  });
});
