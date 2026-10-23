/**
 * OpenAI raktas iš aplinkos (#208).
 *
 * Vercel'yje raktas įrašytas kaip `openaikey` – Secret tipo kintamojo
 * pavadinimo pakeisti nebegalima, o naujas reikalautų rakto įvesti iš naujo.
 * Todėl priimami abu pavadinimai; pirmenybė – įprastam `OPENAI_API_KEY`.
 */
export function openAiKey(): string | null {
  const key = (process.env.OPENAI_API_KEY ?? process.env.openaikey)?.trim();
  return key ? key : null;
}
