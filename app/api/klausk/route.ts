import OpenAI from "openai";

import { parseChatTurns } from "@/lib/assistant-chat";
import { assistantContext } from "@/lib/assistant-data";
import { answerQuestion, DEFAULT_ASSISTANT_MODEL } from "@/lib/assistant-run";
import { todayInVilnius } from "@/lib/local-date";
import { openAiKey } from "@/lib/openai-key";
import { createServerSupabaseClient } from "@/lib/supabase-server";

/**
 * „Klausk Bramit“ pokalbis (#208).
 *
 * Raktas lieka serveryje; modelis duomenų bazės nemato – jis kviečia
 * įrankius, o šie skaito duomenis prisijungusio vartotojo teisėmis (RLS).
 * Įrankiai tik skaito: botas nieko nekeičia ir netrina.
 */

export const maxDuration = 60;

/**
 * Ar asistentas įjungtas. Tikrinama užklausos metu, ne build metu:
 * statiškai sugeneruotas maketas rakto nematė ir mygtukas nepasirodydavo.
 */
export function GET() {
  return Response.json({ enabled: openAiKey() !== null });
}

function failure(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const apiKey = openAiKey();
  if (!apiKey) return failure("AI asistentas dar neprijungtas.", 503);

  const turns = parseChatTurns(await request.json().catch(() => null));
  if (!Array.isArray(turns)) return failure(turns.error, 400);

  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return failure("Prisijunkite iš naujo.", 401);

  const today = todayInVilnius();
  try {
    const result = await answerQuestion(new OpenAI({ apiKey }), turns, assistantContext(supabase, today), {
      model: process.env.OPENAI_CHAT_MODEL?.trim() || DEFAULT_ASSISTANT_MODEL,
      today,
    });
    return result.ok ? Response.json({ answer: result.answer }) : failure(result.error, 502);
  } catch (cause) {
    if (cause instanceof OpenAI.AuthenticationError) return failure("OpenAI raktas netinka.", 502);
    if (cause instanceof OpenAI.RateLimitError) return failure("OpenAI limitas viršytas arba baigėsi kreditas.", 502);
    if (cause instanceof OpenAI.APIError) return failure(`OpenAI klaida (${cause.status ?? "be kodo"}). Bandykite vėliau.`, 502);
    console.error("Klausk Bramit:", cause);
    return failure("Nepavyko atsakyti. Bandykite dar kartą.", 500);
  }
}
