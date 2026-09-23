/**
 * Šalių pavadinimai lietuviškai pagal ISO kodą (#72).
 *
 * Adresų paieška grąžina šalį vietine kalba — „Norge", „Polska", „Danmark".
 * Lietuviui tai skaitosi prasčiau, o sąraše iš dešimties variantų šalis yra
 * pagrindinis skirtukas.
 *
 * **Verčiama tik šalis.** Gatvė ir miestas lieka vietine kalba sąmoningai:
 * vairuotojas Lenkijoje ieško „Warszawa", ne „Varšuvos", ir CMR važtaraštyje
 * rašomas vietinis pavadinimas. Išvertus adresas taptų nenaudojamas ten, kur
 * jo labiausiai reikia.
 */

const PAVADINIMAI: Record<string, string> = {
  AT: "Austrija",
  BE: "Belgija",
  BG: "Bulgarija",
  BY: "Baltarusija",
  CH: "Šveicarija",
  CZ: "Čekija",
  DE: "Vokietija",
  DK: "Danija",
  EE: "Estija",
  ES: "Ispanija",
  FI: "Suomija",
  FR: "Prancūzija",
  GB: "Jungtinė Karalystė",
  GR: "Graikija",
  HR: "Kroatija",
  HU: "Vengrija",
  IE: "Airija",
  IT: "Italija",
  LT: "Lietuva",
  LU: "Liuksemburgas",
  LV: "Latvija",
  MD: "Moldova",
  NL: "Nyderlandai",
  NO: "Norvegija",
  PL: "Lenkija",
  PT: "Portugalija",
  RO: "Rumunija",
  RS: "Serbija",
  RU: "Rusija",
  SE: "Švedija",
  SI: "Slovėnija",
  SK: "Slovakija",
  TR: "Turkija",
  UA: "Ukraina",
};

/**
 * Šalies pavadinimas lietuviškai.
 *
 * Nežinomam kodui grąžinamas tas pavadinimas, kurį atsiuntė paieška: geriau
 * „Kazakhstan" nei tuščia vieta ar kodas, kurio niekas neskaito.
 */
export function countryLt(countryCode: string | null, fallback: string | null): string | null {
  if (countryCode !== null) {
    const found = PAVADINIMAI[countryCode.toUpperCase()];
    if (found !== undefined) return found;
  }
  return fallback;
}
