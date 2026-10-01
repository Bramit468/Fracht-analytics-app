/**
 * Pašto kodo paieška: „FR-51100“, „FR 51100“, „FR51100“, „51100 FR“.
 *
 * Vadybininkai pakrovimo ir iškrovimo vietas ieško pagal šalies raidžių derinį ir
 * pašto kodą. PTV supranta „FR-51100“, bet „FR51100“ ar „DE20095“ supainioja su
 * kitos šalies adresais (Airijos paštu, Ispanijos gatve), o „FR51“ – su Airijos
 * „A63 FR51“. Todėl užklausa prieš siunčiant sutvarkoma, o per trumpas kodas
 * atmetamas su paaiškinimu, užuot rodžius atsitiktinius rezultatus.
 */

/** Šalys, kuriose vežama; kita dviejų raidžių pradžia („Ab12“) laikoma paprastu tekstu. */
const COUNTRIES = new Set([
  "AL", "AT", "BA", "BE", "BG", "BY", "CH", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GB", "GE",
  "GR", "HR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MD", "ME", "MK", "MT", "NL", "NO",
  "PL", "PT", "RO", "RS", "RU", "SE", "SI", "SK", "TR", "UA", "XK",
]);

/** Mažiausiai tiek skaitmenų, kad PTV galėtų pasakyti, kuris tai kodas ir miestas. */
export const MIN_POSTAL_DIGITS = 4;

export interface PostalQuery {
  country: string;
  code: string;
  /** Tekstas PTV paieškai: „FR-51100“. */
  normalized: string;
  /** Kodas per trumpas vienareikšmiškam atsakymui („FR51“). */
  partial: boolean;
}

/** `null`, jei tai ne „šalis + pašto kodas“. */
export function parsePostalQuery(text: string): PostalQuery | null {
  const value = text.trim();
  // Šalis gali būti prieš kodą („FR-51100“) arba po jo („51100 FR“).
  const before = /^([A-Za-z]{2})[\s-]*([0-9A-Za-z][0-9A-Za-z\s-]*)$/.exec(value);
  const after = /^([0-9][0-9A-Za-z\s-]*?)[\s,-]+([A-Za-z]{2})$/.exec(value);

  const country = (before?.[1] ?? after?.[2])?.toUpperCase();
  const rawCode = before?.[2] ?? after?.[1];
  // Kodas be skaitmens („DEfoo“) yra žodis, o ne pašto kodas.
  if (!country || !rawCode || !COUNTRIES.has(country) || !/\d/.test(rawCode)) return null;

  const code = rawCode.trim().replace(/\s+/g, " ").toUpperCase();
  const digits = code.replace(/\D/g, "").length;
  return {
    country,
    code,
    normalized: `${country}-${code}`,
    // Didžiosios Britanijos ir Nyderlandų kodai turi raides, bet pradžia vis tiek skaitmuo.
    partial: digits < MIN_POSTAL_DIGITS && !/[A-Z]/.test(code),
  };
}

/** Užklausa PTV: pašto kodas sutvarkomas, kitas tekstas lieka kaip yra. */
export function normalizeAddressQuery(text: string): string {
  return parsePostalQuery(text)?.normalized ?? text;
}
