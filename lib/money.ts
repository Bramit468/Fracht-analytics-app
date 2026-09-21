/**
 * Pinigų įvedimas ir rodymas.
 *
 * Vartotojas rašo eurais („57", „57,5", „1 234,56"), o saugoma centais
 * (sveikas skaičius). Konvertuojama tekstu, ne per parseFloat × 100, kad
 * „0,29" netaptų 28,999999… centų.
 */

/**
 * Eurų tekstą paverčia centais.
 *
 * Priima kablelį ar tašką kaip dešimtainį skyriklį ir tarpus tarp tūkstančių.
 * Grąžina `null`, jei tekstas nėra neneigiama suma su ne daugiau kaip dviem
 * skaitmenimis po kablelio.
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
/**
 * Centai į formos lauko reikšmę, kurią atgal perskaito parseEuroToCents.
 * Be valiutos ženklo ir tarpų — kitaip savo paties išvesties nebeperskaitytume.
 */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("lt-LT", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
