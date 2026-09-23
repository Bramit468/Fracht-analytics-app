/**
 * ECB dienos valiutų kursai (#57).
 *
 * Telematikos tiekėjas siunčia sumą ta valiuta, kuria pirkta, ir EUR
 * atitikmens neduoda. Be kurso Norvegijos keliai iškrisdavo iš kaštų.
 *
 * Naudojamas 90 dienų failas: jo langas sutampa su tuo, kurį laiko telematika,
 * tad senesnių kursų neprireiks.
 *
 * **Tai lieka įvertis.** ECB orientacinis kursas nėra tas, kuriuo nurašė
 * kortelės tiekėjas — jie konvertuoja savo kursu su savo marža. Todėl
 * perskaičiuotos sumos turi būti pažymėtos, o ne maišomos su tikromis.
 */

export const ECB_90D_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";

/** Kiek vienetų valiutos už eurą, pagal datą: `rates["2026-09-22"]["NOK"]`. */
export type RatesByDate = Record<string, Record<string, number>>;

/**
 * Parsiunčia kursus. Nepavykus grąžina tuščią lentelę, o ne meta klaidą:
 * kursai yra priedas, ne sąlyga — be jų puslapis veikia kaip anksčiau, tik
 * nekonvertuoja. ECB skelbia kartą per parą, tad valanda kešo netrukdo.
 */
export async function fetchEcbRates(): Promise<RatesByDate> {
  try {
    const response = await fetch(ECB_90D_URL, { next: { revalidate: 3600 } });
    if (!response.ok) return {};
    return parseEcbRates(await response.text());
  } catch {
    return {};
  }
}

/**
 * ECB XML į paieškos lentelę.
 *
 * Formatas paprastas ir nekintantis daugelį metų:
 *
 *     <Cube time='2026-09-22'>
 *       <Cube currency='NOK' rate='11.7'/>
 *
 * Todėl skaitoma reguliariuoju reiškiniu, o ne pridedant XML biblioteką dėl
 * vieno failo. Jei ECB formatą pakeistų, testai kristų iškart.
 */
export function parseEcbRates(xml: string): RatesByDate {
  const rates: RatesByDate = {};
  const days = xml.split(/<Cube\s+time=['"]/).slice(1);

  for (const day of days) {
    const date = day.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    const forDay: Record<string, number> = {};
    for (const match of day.matchAll(
      /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g,
    )) {
      const rate = Number(match[2]);
      if (Number.isFinite(rate) && rate > 0) forDay[match[1]] = rate;
    }

    if (Object.keys(forDay).length > 0) rates[date] = forDay;
  }

  return rates;
}

/**
 * Kursas valiutai pirkimo dienai.
 *
 * Savaitgaliais ir per šventes ECB kurso neskelbia, todėl imamas artimiausias
 * ankstesnis. Šiandienos kurso praeities pirkimui neimame: sekmadienio
 * pirkimas turi gauti penktadienio kursą, o ne šios savaitės.
 *
 * `null`, jei valiutos nėra arba visi turimi kursai vėlesni už pirkimą.
 */
export function rateFor(rates: RatesByDate, currency: string, date: string): number | null {
  if (currency === "EUR") return 1;

  const available = Object.keys(rates)
    .filter((day) => day <= date && rates[day][currency] !== undefined)
    .sort();

  const nearest = available[available.length - 1];
  return nearest === undefined ? null : rates[nearest][currency];
}

/**
 * Suma svetima valiuta į eurų centus.
 *
 * `null` grąžinamas sąmoningai: nežinomos valiutos verčiau neskaičiuoti, nei
 * konvertuoti spėjant. Praleista eilutė matoma; spėjimas — ne.
 */
export function toEuroCents(
  rates: RatesByDate,
  amount: number,
  currency: string,
  date: string,
): number | null {
  const rate = rateFor(rates, currency, date);
  if (rate === null || !(rate > 0)) return null;
  return Math.round((amount / rate) * 100);
}
