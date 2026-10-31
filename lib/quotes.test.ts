import { describe, expect, it } from "vitest";

import { quoteVerdict } from "./quote-verdict";
import {
  buildQuoteDraft,
  decisionPatch,
  filterQuotes,
  followedVerdict,
  isMissingQuotesTable,
  quoteKey,
  quoteLogAction,
  quoteStats,
  quoteTripPrice,
  workingDays,
  type QuoteRow,
} from "./quotes";

const stops = [
  { type: "loading" as const, address: " Kaunas ", point: "54.9,23.9" },
  { type: "unloading" as const, address: "Hamburg", point: "53.5,9.9" },
];

function row(overrides: Partial<QuoteRow>): QuoteRow {
  return {
    id: "q", created_by: "u1", created_at: "2026-11-02T08:00:00Z", updated_at: "2026-11-02T08:00:00Z",
    truck_id: null, trip_date: "2026-11-02", stops, origin: "Kaunas", destination: "Hamburg", customer_id: null,
    source: "manual", offer_text: null, offered_price_cents: 120000, paid_km: 1257, empty_km: 0, days: 1.42,
    total_cost_cents: 121069, contribution_cents: 36146, contribution_per_day_cents: 25455, verdict: "negotiate",
    target_price_cents: 121100, decision: "pending", outcome: "open", final_price_cents: null, reason: null, trip_id: null,
    ...overrides,
  };
}

describe("buildQuoteDraft", () => {
  it("užšaldo verdikto skaičius ir apvalina kaip stulpeliai", () => {
    const verdict = quoteVerdict({ priceCents: 120000, totalCostCents: 121069, contributionCents: 36146, days: 1.42, bandPercent: null, beatsAlternative: true });
    const draft = buildQuoteDraft({
      truckId: "t1", tripDate: "2026-11-02", stops, customerId: null, source: "timocom", offerText: "x".repeat(5000),
      priceCents: 120000, paidKm: 1257.456, emptyKm: 12.3456, days: 1.41666, totalCostCents: 121069, contributionCents: 36146, verdict,
    });
    expect(draft).toMatchObject({
      origin: "Kaunas", destination: "Hamburg", paid_km: 1257.46, empty_km: 12.35, days: 1.417,
      verdict: "negotiate", target_price_cents: 121100, contribution_per_day_cents: 25455, source: "timocom",
    });
    expect(draft.offer_text).toHaveLength(4000);
  });

  it("tuščia fura ir data – null, ne tuščias tekstas", () => {
    const verdict = quoteVerdict({ priceCents: 1, totalCostCents: 1, contributionCents: 0, days: 1, bandPercent: null, beatsAlternative: false });
    const draft = buildQuoteDraft({ truckId: "", tripDate: "", stops, customerId: null, source: "manual", offerText: null, priceCents: 1, paidKm: 1, emptyKm: 0, days: 1, totalCostCents: 1, contributionCents: 0, verdict });
    expect(draft.truck_id).toBeNull();
    expect(draft.trip_date).toBeNull();
  });
});

describe("kada nauja eilutė", () => {
  const key = quoteKey(stops, "2026-11-02");

  it("raktas – data ir taškai, ne kaina", () => {
    expect(key).toBe("2026-11-02|54.9,23.9>53.5,9.9");
    expect(quoteKey([{ type: "loading", address: " Kaunas ", point: "" }], null)).toBe("|kaunas");
  });

  it("pirmas skaičiavimas – įrašyti; nespręstas – atnaujinti; nuspręstas – užšaldytas", () => {
    expect(quoteLogAction({ id: null, key: "", decided: false }, key)).toBe("insert");
    expect(quoteLogAction({ id: "q", key, decided: false }, "kitas")).toBe("update");
    expect(quoteLogAction({ id: "q", key, decided: true }, key)).toBe("skip");
    expect(quoteLogAction({ id: "q", key, decided: true }, "kitas")).toBe("insert");
  });
});

describe("decisionPatch", () => {
  it("paėmėm – laimėtas, nepaėmėm – pralaimėtas, deramės – atviras", () => {
    expect(decisionPatch("taken", "1 210", "")).toEqual({ ok: true, patch: { decision: "taken", outcome: "won", final_price_cents: 121000, reason: null } });
    expect(decisionPatch("declined", "", " Per brangu užsakovui ")).toMatchObject({ ok: true, patch: { outcome: "lost", reason: "Per brangu užsakovui" } });
    expect(decisionPatch("negotiating", "", "")).toMatchObject({ ok: true, patch: { outcome: "open" } });
  });

  it("neteisinga kaina – klaida, ne tylus nulis", () => {
    expect(decisionPatch("taken", "1.210,555", "")).toMatchObject({ ok: false });
  });
});

describe("followedVerdict", () => {
  it.each([
    ["take", "taken", null, true],
    ["take", "declined", null, false],
    ["reject", "declined", null, true],
    ["reject", "taken", 100000, false],
    ["negotiate", "negotiating", null, true],
    ["negotiate", "taken", 121100, true],
    ["negotiate", "taken", 120000, false],
    ["negotiate", "taken", null, false],
    ["negotiate", "declined", null, true],
  ] as const)("%s + %s (%s) -> %s", (verdict, decision, final, expected) => {
    expect(followedVerdict(row({ verdict, decision, final_price_cents: final }))).toBe(expected);
  });

  it("nenuspręsta – nevertinama", () => {
    expect(followedVerdict(row({}))).toBeNull();
  });
});

describe("statistika", () => {
  it("darbo dienos be savaitgalių", () => {
    expect(workingDays("2026-11-02", "2026-11-08")).toBe(5);
    expect(workingDays("2026-11-07", "2026-11-08")).toBe(0);
    expect(workingDays("2026-11-08", "2026-11-02")).toBe(0);
  });

  it("laimėti nuo baigtų, sekta verdiktu nuo nuspręstų, dispečeriai ir priežastys", () => {
    const rows = [
      row({ id: "1", verdict: "take", decision: "taken", outcome: "won" }),
      row({ id: "2", verdict: "reject", decision: "declined", outcome: "lost", reason: "Per mažas įnašas" }),
      row({ id: "3", verdict: "take", decision: "declined", outcome: "lost", reason: "Nėra laisvos furos", created_by: "u2" }),
      row({ id: "4" }),
    ];
    const stats = quoteStats(rows, "2026-11-02", "2026-11-06");
    expect(stats).toMatchObject({ count: 4, decided: 3, won: 1, lost: 2, workingDays: 5 });
    expect(stats.winRate).toBeCloseTo(33.33, 1);
    expect(stats.followedRate).toBeCloseTo(66.67, 1);
    expect(stats.byDispatcher).toEqual([
      { createdBy: "u1", count: 3, perWorkingDay: 0.6 },
      { createdBy: "u2", count: 1, perWorkingDay: 0.2 },
    ]);
    expect(stats.reasons.map((reason) => reason.reason)).toEqual(["Per mažas įnašas", "Nėra laisvos furos"]);
  });

  it("be baigtų – procentų nėra, ne nulis", () => {
    const stats = quoteStats([row({})], "2026-11-02", "2026-11-02");
    expect(stats.winRate).toBeNull();
    expect(stats.followedRate).toBeNull();
  });

  it("filtrai: laikotarpis vietos laiku, sprendimas, rezultatas, dispečeris", () => {
    const rows = [
      row({ id: "a", created_at: "2026-11-01T22:30:00Z" }),
      row({ id: "b", decision: "taken", outcome: "won", created_by: "u2" }),
    ];
    const vilnius = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Vilnius" });
    const all = { from: "2026-11-02", to: "2026-11-02", decision: "" as const, outcome: "" as const, createdBy: "" };
    // 22:30 UTC jau lapkričio 2 d. Vilniuje.
    expect(filterQuotes(rows, all, vilnius).map((r) => r.id)).toEqual(["a", "b"]);
    expect(filterQuotes(rows, { ...all, outcome: "won" }, vilnius).map((r) => r.id)).toEqual(["b"]);
    expect(filterQuotes(rows, { ...all, createdBy: "u1" }, vilnius).map((r) => r.id)).toEqual(["a"]);
  });
});

it("reisui – galutinė kaina, jei sutarta", () => {
  expect(quoteTripPrice({ final_price_cents: 121000, offered_price_cents: 120000 })).toBe(121000);
  expect(quoteTripPrice({ final_price_cents: null, offered_price_cents: 120000 })).toBe(120000);
});

it("nepaleista migracija atpažįstama", () => {
  expect(isMissingQuotesTable({ code: "PGRST205", message: "Could not find the table 'public.quotes' in the schema cache" })).toBe(true);
  expect(isMissingQuotesTable({ code: "23505", message: "duplicate" })).toBe(false);
  expect(isMissingQuotesTable(null)).toBe(false);
});
