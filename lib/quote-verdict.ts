/**
 * Pasiūlymo verdiktas viena eilute: Imti / Derėtis iki X € / Neimti.
 *
 * Įmonės taisyklė (#248): žemiausia kaina – savikaina. Todėl „Imti“, kai kaina
 * padengia visus kaštus, o X – savikaina, suapvalinta iki eurų į viršų: tai
 * mažiausia kaina, nuo kurios verdiktas tampa „Imti“. Derėtis verta tik tada,
 * kai X nedaug virš pasiūlytos kainos – riba (procentais) yra įmonės
 * nustatymas; virš jos krovinys atmetamas.
 *
 * Kai krovinys žemiau savikainos, bet vis tiek geresnis už alternatyvą
 * (`loadVerdict` – „approval“), pakeliui važiuoti galima tik vadovui pritarus –
 * tai pastaba prie verdikto, ne atskiras verdiktas.
 */

/** Numatytoji derybų riba, kai įmonė savos nenustatė arba migracija 0024 nepaleista. */
export const DEFAULT_NEGOTIATION_BAND_PERCENT = 15;

export type QuoteVerdictKind = "take" | "negotiate" | "reject";

export interface QuoteVerdictInput {
  /** Pasiūlyta kaina (pajamos) centais. */
  priceCents: number;
  /** Pilni reiso kaštai (savikaina) centais. */
  totalCostCents: number;
  /** Įnašas centais – pajamos minus kintami kaštai. */
  contributionCents: number;
  /** Paros trupmenomis. */
  days: number;
  /** Įmonės derybų riba procentais; `null` – numatytoji. */
  bandPercent: number | null;
  /** Ar krovinys geresnis už alternatyvą bent įmonės riba (`loadVerdict` – „approval“ ar „take“). */
  beatsAlternative: boolean;
}

export interface QuoteVerdict {
  kind: QuoteVerdictKind;
  /** Mažiausia kaina, nuo kurios verdiktas „Imti“ (savikaina, sveiki eurai). */
  targetPriceCents: number;
  /** Kiek procentų X viršija pasiūlytą kainą. `null`, kai kainos nėra. */
  increasePercent: number | null;
  /** Įnašas per parą centais. `null`, kai parų nėra. */
  contributionPerDayCents: number | null;
  /** Žemiau savikainos, bet geriau už alternatyvą – tik vadovui pritarus. */
  approvalPossible: boolean;
  /** Taikyta derybų riba procentais. */
  bandPercent: number;
}

/** Savikaina, suapvalinta iki eurų į viršų: deramasi sveikais eurais. */
function wholeEurosUp(cents: number): number {
  return Math.ceil(Math.max(0, cents) / 100) * 100;
}

export function quoteVerdict(input: QuoteVerdictInput): QuoteVerdict {
  const bandPercent = input.bandPercent !== null && Number.isFinite(input.bandPercent) && input.bandPercent >= 0
    ? input.bandPercent
    : DEFAULT_NEGOTIATION_BAND_PERCENT;
  const targetPriceCents = wholeEurosUp(input.totalCostCents);
  const contributionPerDayCents = input.days > 0 ? Math.round(input.contributionCents / input.days) : null;
  const increasePercent = input.priceCents > 0
    ? ((targetPriceCents - input.priceCents) / input.priceCents) * 100
    : null;

  // Kaina padengia visus kaštus – centų tikslumu, ne suapvalintą X.
  if (input.priceCents >= input.totalCostCents) {
    return { kind: "take", targetPriceCents, increasePercent, contributionPerDayCents, approvalPossible: false, bandPercent };
  }

  // Sveikais skaičiais, kad 15,000…1 % nepavirstų 15 % per slankiojo kablelio paklaidą:
  // X ≤ kaina × (100 + riba) / 100.
  const withinBand = input.priceCents > 0
    && targetPriceCents * 100 <= Math.round(input.priceCents * (100 + bandPercent));

  return {
    kind: withinBand ? "negotiate" : "reject",
    targetPriceCents,
    increasePercent,
    contributionPerDayCents,
    approvalPossible: input.beatsAlternative,
    bandPercent,
  };
}

export type ParsedBandPercent = { ok: true; value: number | null } | { ok: false; error: string };

/** Įmonės derybų riba iš formos: tuščia – numatytoji (15 %). */
export function parseNegotiationBand(text: string): ParsedBandPercent {
  const trimmed = text.trim().replace(/\s*%$/, "");
  if (trimmed === "") return { ok: true, value: null };
  const value = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    return { ok: false, error: "Įrašykite skaičių nuo 0 iki 100." };
  }
  return { ok: true, value: Math.round(value * 100) / 100 };
}
