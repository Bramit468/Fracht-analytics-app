/**
 * Pokalbio žinutės ir instrukcijos modeliui („Klausk Bramit“).
 *
 * Istoriją laiko naršyklė ir kiekvieną kartą atsiunčia visą – serveryje
 * nieko nesaugome. Todėl ji tikrinama ir apkarpoma čia: be ribų vienas
 * ilgas pokalbis kainuotų vis brangiau su kiekvienu klausimu.
 */

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Kiek paskutinių žinučių siunčiama modeliui. */
export const MAX_TURNS = 12;
export const MAX_QUESTION_LENGTH = 1000;
const MAX_ANSWER_LENGTH = 6000;

export function parseChatTurns(body: unknown): ChatTurn[] | { error: string } {
  const messages = typeof body === "object" && body !== null ? (body as { messages?: unknown }).messages : undefined;
  if (!Array.isArray(messages) || messages.length === 0) return { error: "Nėra klausimo." };

  const turns: ChatTurn[] = [];
  for (const message of messages) {
    if (typeof message !== "object" || message === null) return { error: "Netinkama žinutė." };
    const { role, content } = message as { role?: unknown; content?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      return { error: "Netinkama žinutė." };
    }
    const text = content.trim();
    if (text === "") continue;
    turns.push({ role, content: role === "user" ? text : text.slice(0, MAX_ANSWER_LENGTH) });
  }

  const last = turns.at(-1);
  if (!last || last.role !== "user") return { error: "Nėra klausimo." };
  if (last.content.length > MAX_QUESTION_LENGTH) {
    return { error: `Klausimas per ilgas – iki ${MAX_QUESTION_LENGTH} simbolių.` };
  }

  // Pokalbis turi prasidėti klausimu, net kai senesnė dalis nukirpta.
  const recent = turns.slice(-MAX_TURNS);
  while (recent.length > 0 && recent[0].role !== "user") recent.shift();
  return recent;
}

/**
 * Instrukcijos. Svarbiausia taisyklė – skaičiai tik iš įrankių: pelno
 * programoje neteisingas skaičius yra blogiau nei „nežinau“.
 */
export function systemPrompt(today: string): string {
  return `Tu – „Bramit“ asistentas: padedi krovinių vežimo įmonei suprasti savo reisų pelningumą.

Šiandien ${today}. Laikotarpius („šis mėnuo“, „praėjęs ketvirtis“, „šie metai“) paversk tikslia data nuo–iki pagal šią datą.

Taisyklės:
- Kiekvieną skaičių imk tik iš įrankių atsakymų ir rašyk tokį, kokį gavai. Pats nesumuok, nedalink ir nespėliok. Jei reikia skaičiaus, kurio įrankiai neduoda, pasakyk, kad jo nėra.
- Visada pasakyk, kokiam laikotarpiui ir kokiai atrankai skaičiai galioja.
- Jei įrankis grąžino 0 reisų, taip ir pasakyk – nesigalvok priežasčių.
- Marža – pelnas nuo pajamų. Sumos be PVM. Pelnas per parą – pelnas, padalytas iš parų, kurias fura užėmė reisas.
- Išsaugotų reisų pelnas skaičiuotas su furos kaštais, galiojusiais reiso metu.
- Gali paaiškinti, kodėl skaičius toks, ir pasiūlyti, ką tikrinti, bet atskirk faktą nuo patarimo.
- Atsakyk lietuviškai, trumpai ir paprastai. Be lentelių; sąrašui naudok eilutes su „-“. Be įžangų ir mandagumo frazių.
- Jei klausimas ne apie įmonės reisus, furas, užsakovus ar apmokėjimus, mandagiai pasakyk, kad gali padėti tik su jais.`;
}
