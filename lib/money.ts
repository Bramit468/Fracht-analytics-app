/**
 * Pinigų įvedimas ir rodymas.
 *
 * Vartotojas rašo eurais, o saugoma centais kaip sveikas skaičius.
 */
export function parseEuroToCents(input: string): number | null {
  const normalized = input.trim().replace(/[\s ]/g, "").replace(",", ".");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) {
    return null;
  }

  const euros = Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0"));
  const total = euros * 100 + cents;

  return Number.isSafeInteger(total) ? total : null;
}

/** Centus parodo eurais lietuvišku formatu, pvz. 26900 -> „269,00 €". */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("lt-LT", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
