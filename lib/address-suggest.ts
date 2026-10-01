/**
 * Adresų pasiūlymai rašant per PTV (#73).
 *
 * `by-text` ieško tik pilnų žodžių: „Hamb" grąžina vieną atsitiktinį kaimą, o
 * ne Hamburgą. Rašant tinka `suggestions` — jis atpažįsta žodžio pradžią ir
 * grąžina lietuviškus pavadinimus. Koordinačių pasiūlymas neturi; jos gaunamos
 * tik pasirinkus, per `by-text` su pasiūlymo `searchText`.
 *
 * Anksčiau buvo Nominatim, bet jo viešo serverio taisyklės draudžia užklausas
 * po kiekvieno klavišo.
 */

import { parsePostalQuery } from "./postal-code";

export const PTV_SUGGESTIONS_URL = "https://api.myptv.com/geocoding/v1/suggestions/by-text";

/** Trumpiausia užklausa, kuriai verta kreiptis į paiešką. */
export const MIN_ADDRESS_QUERY = 3;

export interface AddressSuggestion {
  /** Pagrindinis pavadinimas: „Hamburg", „4 Klaipėdos gatvė". */
  caption: string;
  /** Kur tai yra: šalis, apskritis, miestas. */
  subCaption: string;
  /** Tekstas, kurį reikia duoti `by-text`, kad gautume koordinates. */
  searchText: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** PTV nežinomą pašto kodą kaukuoja žvaigždutėmis („01001*“): rodomi tik pilni žodžiai. */
function withoutMasks(value: string): string {
  return value.split(/\s+/).filter((word) => !word.includes("*")).join(" ");
}

/** PTV atsakymą paverčia pasirinkimo sąrašu; blogus įrašus praleidžia. */
export function parseSuggestions(payload: unknown, limit = 6): AddressSuggestion[] {
  if (typeof payload !== "object" || payload === null) return [];
  const rows = (payload as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(rows)) return [];

  const found: AddressSuggestion[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const item = row as Record<string, unknown>;
    const caption = withoutMasks(text(item.caption));
    const searchText = text(item.searchText);
    // Be `searchText` pasirinkimo nebūtų kuo paversti į tašką.
    if (caption === "" || searchText === "" || seen.has(searchText)) continue;
    seen.add(searchText);

    // PTV pašto kodą rašo „51100 FR“, o vadybininkai – „FR-51100“; miestas lieka eilutėje žemiau.
    const postal = parsePostalQuery(caption);
    found.push({
      caption: postal && !postal.partial ? postal.normalized : caption,
      subCaption: withoutMasks(text(item.subCaption)),
      searchText,
    });
    if (found.length >= limit) break;
  }

  return found;
}
