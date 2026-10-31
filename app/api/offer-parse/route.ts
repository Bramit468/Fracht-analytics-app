import OpenAI from "openai";

import { todayInVilnius } from "@/lib/local-date";
import { DEFAULT_OFFER_MODEL, extractOfferWithAi } from "@/lib/offer-ai";
import { MAX_OFFER_TEXT } from "@/lib/offer-parse";
import { openAiKey } from "@/lib/openai-key";
import { offerParseLimiter, rateLimitHeaders, rateLimitMessage, withRateLimitHeaders } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase-server";

/**
 * Įklijuotas pasiūlymas, kurio taisyklės nesuprato (Phase 0, 4 punktas).
 *
 * Raktas lieka serveryje. OpenAI siunčiamas tik įklijuotas tekstas – jokių
 * įmonės duomenų; atsakymas grąžinamas jau patikrintas pagal tekstą.
 */

export const maxDuration = 30;

function failure(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const apiKey = openAiKey();
  if (!apiKey) return failure("AI neprijungtas – užpildykite laukus ranka.", 503);

  const body: unknown = await request.json().catch(() => null);
  const text = typeof body === "object" && body !== null && typeof (body as { text?: unknown }).text === "string"
    ? (body as { text: string }).text.trim()
    : "";
  if (!text) return failure("Įklijuokite pasiūlymo tekstą.", 400);
  if (text.length > MAX_OFFER_TEXT) return failure(`Tekstas per ilgas – daugiausia ${MAX_OFFER_TEXT} simbolių.`, 400);

  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return failure("Prisijunkite iš naujo.", 401);

  const limit = offerParseLimiter(claims.claims.sub);
  if (!limit.ok) return Response.json({ error: rateLimitMessage(limit) }, { status: 429, headers: rateLimitHeaders(limit) });

  try {
    const fields = await extractOfferWithAi(new OpenAI({ apiKey }), text, {
      model: process.env.OPENAI_OFFER_MODEL?.trim() || DEFAULT_OFFER_MODEL,
      today: todayInVilnius(),
    });
    return withRateLimitHeaders(Response.json({ fields }), limit);
  } catch (cause) {
    if (cause instanceof OpenAI.AuthenticationError) return failure("OpenAI raktas netinka.", 502);
    if (cause instanceof OpenAI.RateLimitError) return failure("OpenAI limitas viršytas arba baigėsi kreditas.", 502);
    console.error("Pasiūlymo skaitymas per AI:", cause);
    return failure("AI pasiūlymo neperskaitė – užpildykite trūkstamus laukus ranka.", 502);
  }
}
