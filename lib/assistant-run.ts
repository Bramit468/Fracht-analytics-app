import type OpenAI from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";

import { systemPrompt, type ChatTurn } from "./assistant-chat";
import { ASSISTANT_TOOLS, runAssistantTool, type AssistantContext } from "./assistant-tools";

/**
 * Šiek tiek silpnesnis ir perpus pigesnis už Etsy naudojamą gpt-5.5:
 * skaičius pateikia įrankiai, modeliui lieka parinkti juos ir paaiškinti.
 */
export const DEFAULT_ASSISTANT_MODEL = "gpt-5.4";

/** Kiek kartų modelis gali kreiptis į įrankius per vieną klausimą. */
const MAX_ROUNDS = 6;

export type AssistantAnswer =
  | { ok: true; answer: string; toolCalls: string[] }
  | { ok: false; error: string };

/**
 * Vienas klausimas: modelis kviečia įrankius, kol turi atsakymą.
 *
 * Responses API, ne Chat Completions: gpt-5.4 per Chat Completions įrankių
 * kartu su mąstymu neleidžia. `store: false` – įmonės skaičiai OpenAI pusėje
 * nesaugomi; todėl mąstymo dalis grąžinama užšifruota ir siunčiama atgal
 * kitame rate.
 *
 * Duomenys kraunami tik tada, kai modelis jų paprašo (`AssistantContext`).
 */
export async function answerQuestion(
  client: OpenAI,
  turns: ChatTurn[],
  context: AssistantContext,
  options: { model: string; today: string },
): Promise<AssistantAnswer> {
  const input: ResponseInputItem[] = turns.map((turn) => ({ role: turn.role, content: turn.content }));
  const toolCalls: string[] = [];

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const response = await client.responses.create({
      model: options.model,
      instructions: systemPrompt(options.today),
      input,
      tools: ASSISTANT_TOOLS,
      reasoning: { effort: "low" },
      max_output_tokens: 4000,
      store: false,
      include: ["reasoning.encrypted_content"],
    });

    const calls = response.output.filter((item) => item.type === "function_call");
    if (calls.length === 0) {
      const answer = response.output_text.trim();
      return answer
        ? { ok: true, answer, toolCalls }
        : { ok: false, error: "Atsakymo nėra – pabandykite paklausti kitaip." };
    }

    input.push(...(response.output as ResponseInputItem[]));
    // Kelis įrankius vienu metu – kitaip Telematikos ir duomenų bazės
    // užklausos lauktų viena kitos.
    const results = await Promise.all(calls.map((call) => runAssistantTool(call.name, call.arguments, context)));
    calls.forEach((call, index) => {
      toolCalls.push(`${call.name}(${call.arguments})`);
      input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(results[index]) });
    });
  }

  return { ok: false, error: "Klausimas per sudėtingas vienam kartui – paklauskite siauriau." };
}
