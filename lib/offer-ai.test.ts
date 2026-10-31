import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";

import { extractOfferWithAi } from "./offer-ai";
import { mergeOffer, needsAi, parseOffer } from "./offer-parse";

const TODAY = "2026-10-31";
const TEXT = "Hallo, wir haben morgen eine Ladung ab Hamburg (20457) nach Kaunas, 22 t, Preis 1.200 EUR";

function fakeClient(answer: unknown) {
  const create = vi.fn().mockResolvedValue({ output_text: typeof answer === "string" ? answer : JSON.stringify(answer) });
  return { client: { responses: { create } } as unknown as OpenAI, create };
}

describe("extractOfferWithAi", () => {
  it("siunčia tik tekstą, strict schema, nesaugoma OpenAI pusėje", async () => {
    const { client, create } = fakeClient({});
    await extractOfferWithAi(client, TEXT, { model: "m", today: TODAY });
    const request = create.mock.calls[0][0];
    expect(request.input).toBe(TEXT);
    expect(request.store).toBe(false);
    expect(request.text.format).toMatchObject({ type: "json_schema", strict: true });
  });

  it("taisyklės + AI: užpildoma tai, ko taisyklės nerado, išgalvota išmetama", async () => {
    const rules = parseOffer(TEXT, TODAY);
    expect(needsAi(rules)).toBe(true);

    const { client } = fakeClient({
      source: "unknown",
      loading: { country: "DE", postalCode: "20457", city: "Hamburg" },
      unloading: { country: "LT", postalCode: "44001", city: "Kaunas" },
      extraStops: [],
      loadingDate: "2026-11-01", loadingTime: null, unloadingDate: "2026-11-03",
      price: 1200, currency: "EUR", weightKg: 22000, ldm: null, pallets: null,
    });
    const ai = await extractOfferWithAi(client, TEXT, { model: "m", today: TODAY });
    const { fields, fromAi } = mergeOffer(rules.fields, ai);

    expect(fields.loading).toEqual({ country: "DE", postalCode: "20457", city: "Hamburg" });
    // Pašto kodo 44001 tekste nėra, iškrovimo datos irgi – AI juos išgalvojo.
    expect(fields.unloading).toEqual({ country: "LT", postalCode: null, city: "Kaunas" });
    expect(fields.unloadingDate).toBeNull();
    expect(fields.loadingDate).toBe("2026-11-01");
    expect(fields.priceCents).toBe(120000);
    expect(fields.weightKg).toBe(22000);
    expect(fromAi).toContain("loading");
  });

  it("ne JSON – tušti laukai, ne klaida", async () => {
    const { client } = fakeClient("atsiprašau, nesupratau");
    const ai = await extractOfferWithAi(client, TEXT, { model: "m", today: TODAY });
    expect(ai.loading).toBeNull();
    expect(ai.priceCents).toBeNull();
  });
});
