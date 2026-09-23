/**
 * Adresų paieška lietuviškai per Nominatim (#73).
 *
 * OpenStreetMap turi `name:lt` žymes, todėl su `accept-language=lt` visa Europa
 * grąžinama lietuviškai: „Oslas, Norvegija", „Hamburgas, Vokietija".
 *
 * Gatvė lieka vietine kalba, o miestas ir šalis verčiami — būtent taip ir
 * reikia: vairuotojas Lenkijoje ieško „Marszałkowska", bet žemėlapyje nori
 * matyti „Varšuva, Lenkija".
 *
 * Nominatim viešo serverio taisyklės neleidžia siųsti užklausos po kiekvieno
 * klavišo, todėl paieška vyksta paspaudus mygtuką, o ne rašant. Užklausa eina
 * iš serverio: reikalaujama atpažįstamo `User-Agent`, o naršyklė jo nustatyti
 * neleidžia.
 */

export const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/** Nominatim reikalauja atpažinti programą, kitaip užklausas blokuoja. */
export const NOMINATIM_USER_AGENT = "fracht-analytics-app (https://fracht-analytics-app.vercel.app)";

export interface FoundAddress {
  /** Trumpasis pavadinimas: namas, gatvė, miestas. */
  label: string;
  /** Likusi adreso dalis — savivaldybė, apskritis, pašto kodas, šalis. */
  sublabel: string;
  latitude: number;
  longitude: number;
}

/** Kiek pirmųjų adreso dalių rodyti kaip pagrindinį pavadinimą. */
const PAGRINDINES_DALYS = 3;

function decimal(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Nominatim atsakymą paverčia pasirinkimo sąrašu.
 *
 * `lat` ir `lon` ateina **tekstu**, ne skaičiais — tai lengva pražiūrėti, o
 * tekstinė koordinatė toliau virstų `NaN` ir maršrutas nulūžtų be paaiškinimo.
 */
export function parseNominatim(payload: unknown, limit = 6): FoundAddress[] {
  if (!Array.isArray(payload)) return [];

  const found: FoundAddress[] = [];
  const seen = new Set<string>();

  for (const row of payload) {
    if (typeof row !== "object" || row === null) continue;
    const item = row as Record<string, unknown>;

    const latitude = decimal(item.lat);
    const longitude = decimal(item.lon);
    const display = typeof item.display_name === "string" ? item.display_name : "";
    if (latitude === null || longitude === null || display === "") continue;
    if (seen.has(display)) continue;
    seen.add(display);

    const parts = display.split(",").map((part) => part.trim()).filter(Boolean);
    found.push({
      label: parts.slice(0, PAGRINDINES_DALYS).join(", "),
      sublabel: parts.slice(PAGRINDINES_DALYS).join(", "),
      latitude,
      longitude,
    });

    if (found.length >= limit) break;
  }

  return found;
}

/** Pilnas adresas vienoje eilutėje — toks įrašomas į reiso laukelį. */
export function addressLabel(address: FoundAddress): string {
  return address.sublabel ? `${address.label}, ${address.sublabel}` : address.label;
}
