import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { parseChatTurns, systemPrompt } from "@/lib/assistant-chat";
import { ASSISTANT_TOOLS, runAssistantTool, type AssistantData } from "@/lib/assistant-tools";
import { listCustomers } from "@/lib/customers";
import { todayInVilnius } from "@/lib/local-date";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fetchTripSummaries } from "@/lib/trips";
import type { Truck } from "@/types/truck";

/**
 * „Klausk Bramit“ pokalbis.
 *
 * Raktas lieka serveryje; modelis duomenų bazės nemato – jis kviečia
 * įrankius, o šie skaito duomenis prisijungusio vartotojo teisėmis (RLS).
 */

/**
 * Šiek tiek silpnesnis ir perpus pigesnis už Etsy naudojamą gpt-5.5:
 * skaičius pateikia įrankiai, modeliui lieka parinkti juos ir paaiškinti.
 */
const DEFAULT_MODEL = "gpt-5.4";

/** Kiek kartų modelis gali kreiptis į įrankius per vieną klausimą. */
const MAX_ROUNDS = 6;

export const maxDuration = 60;

function failure(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return failure("AI asistentas dar neprijungtas.", 503);

  const turns = parseChatTurns(await request.json().catch(() => null));
  if (!Array.isArray(turns)) return failure(turns.error, 400);

  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return failure("Prisijunkite iš naujo.", 401);

  // Duomenys kraunami tik tada, kai modelis jų paprašo, ir vieną kartą.
  let data: Promise<AssistantData> | null = null;
  const loadData = () => (data ??= (async () => {
    const [trips, customers, trucks] = await Promise.all([
      fetchTripSummaries(supabase),
      listCustomers(supabase),
      supabase.from("trucks").select("*").order("plate").overrideTypes<Truck[], { merge: false }>(),
    ]);
    if (trucks.error) throw trucks.error;
    return { trips, customers: customers.customers, trucks: trucks.data ?? [], today: todayInVilnius() };
  })());

  const client = new OpenAI({ apiKey });
  const messages: ChatCompletionMessageParam[] = [
    { role: "developer", content: systemPrompt(todayInVilnius()) },
    ...turns,
  ];

  try {
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const completion = await client.chat.completions.create({
        model: process.env.OPENAI_CHAT_MODEL?.trim() || DEFAULT_MODEL,
        messages,
        tools: ASSISTANT_TOOLS,
        reasoning_effort: "low",
        max_completion_tokens: 4000,
      });
      const message = completion.choices[0]?.message;
      if (!message) return failure("AI negrąžino atsakymo. Bandykite dar kartą.", 502);

      if (!message.tool_calls?.length) {
        return Response.json({ answer: message.content?.trim() || "Atsakymo nėra – pabandykite paklausti kitaip." });
      }

      messages.push(message);
      for (const call of message.tool_calls) {
        const result = call.type === "function"
          ? runAssistantTool(call.function.name, call.function.arguments, await loadData())
          : { klaida: "Toks įrankis nepalaikomas." };
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    return failure("Klausimas per sudėtingas vienam kartui – paklauskite siauriau.", 422);
  } catch (cause) {
    if (cause instanceof OpenAI.AuthenticationError) return failure("OpenAI raktas netinka.", 502);
    if (cause instanceof OpenAI.RateLimitError) return failure("OpenAI limitas viršytas arba baigėsi kreditas.", 502);
    if (cause instanceof OpenAI.APIError) return failure(`OpenAI klaida (${cause.status ?? "be kodo"}). Bandykite vėliau.`, 502);
    console.error("Klausk Bramit:", cause);
    return failure("Nepavyko atsakyti. Bandykite dar kartą.", 500);
  }
}
