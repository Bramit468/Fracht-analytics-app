/**
 * PTV Developer: adresas -> maršrutas -> kilometrai ir kelių mokesčiai (#61).
 *
 * Šitas failas tik **verčia** PTV atsakymą į tai, ką supranta reiso forma.
 * Užklausos gyvena server action'e, nes raktas į naršyklę patekti negali.
 *
 * Kodėl verta: iki šiol šalių atkarpos vedamos ranka, ir suklydus km
 * pasiskirstyme klysta kelių kaštai, o klaida nematoma — skaičius atrodo
 * tvarkingas. PTV mokesčius pasako tiesiogiai, tad spėti nebereikia.
 */

export const PTV_GEOCODING_URL = "https://api.myptv.com/geocoding/v1/locations/by-text";
export const PTV_SUGGESTIONS_URL = "https://api.myptv.com/geocoding/v1/suggestions/by-text";
export const PTV_ROUTING_URL = "https://api.myptv.com/routing/v1/routes";

/** 40 t vilkikas. Kiti profiliai duotų kitus mokesčius ir kitus draudimus. */
export const PTV_TRUCK_PROFILE = "EUR_TRUCK_40T";

export interface GeocodedPlace {
  latitude: number;
  longitude: number;
  /** PTV sutvarkytas adresas — parodomas, kad matytųsi, ką jis suprato. */
  formattedAddress: string;
  /** `EXACT_ADDRESS`, `LOCALITY` ir pan. Netikslus taškas duoda netikslius km. */
  locationType: string;
}

export interface CountryToll {
  countryCode: string;
  euroCents: number;
}

export interface RouteEstimate {
  km: number;
  /** Kelio laikas be poilsio ir laukimo. Reiso trukmė visada ilgesnė. */
  travelHours: number;
  tollCents: number;
  byCountry: CountryToll[];
  /** PTV neranda vilkikui tinkamo kelio arba jis pažeidžia ribojimus. */
  violated: boolean;
}

function decimal(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Vienas pasiūlymas iš PTV autocomplete.
 *
 * PTV paieška hierarchinė: šalis -> apskritis -> miestas -> gatvė -> namas.
 * Todėl „klaipedos g" jam reiškia ne Klaipėdos gatvę, o Klaipėdos apskritį ir
 * vietovę iš G raidės. Dėl to rodyti reikia ne tik pavadinimą, bet ir
 * `subCaption` su rajonu — kitaip dešimt Gardamų atrodo vienodai.
 */
export interface PlaceSuggestion {
  caption: string;
  subCaption: string;
  /** PTV sunormintas tekstas, kurį paduodi geokoderiui koordinatėms gauti. */
  searchText: string;
}

export function parseSuggestions(payload: unknown, limit = 8): PlaceSuggestion[] {
  if (typeof payload !== "object" || payload === null) return [];
  const rows = (payload as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(rows)) return [];

  const found: PlaceSuggestion[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const suggestion = row as Record<string, unknown>;
    const caption = text(suggestion.caption);
    const searchText = text(suggestion.searchText);
    if (caption === null || searchText === null) continue;

    const subCaption = text(suggestion.subCaption) ?? "";
    const key = `${caption}|${subCaption}`;
    if (seen.has(key)) continue;
    seen.add(key);

    found.push({ caption, subCaption, searchText });
    if (found.length >= limit) break;
  }

  return found;
}

function toPlace(row: unknown): GeocodedPlace | null {
  if (typeof row !== "object" || row === null) return null;
  const location = row as Record<string, unknown>;
  const position = location.referencePosition as Record<string, unknown> | undefined;
  const latitude = decimal(position?.latitude);
  const longitude = decimal(position?.longitude);
  if (latitude === null || longitude === null) return null;

  return {
    latitude,
    longitude,
    formattedAddress: text(location.formattedAddress) ?? "",
    locationType: text(location.locationType) ?? "",
  };
}

/**
 * Keli variantai pasirinkimui (#65).
 *
 * „Klaipėdos g. 4" PTV grąžina 42 adresus keturiuose miestuose, visus vienodo
 * tikslumo. Pirmas sąraše yra atsitiktinis, todėl rinktis turi žmogus.
 */
export function placeSuggestions(payload: unknown, limit = 6): GeocodedPlace[] {
  if (typeof payload !== "object" || payload === null) return [];
  const locations = (payload as { locations?: unknown }).locations;
  if (!Array.isArray(locations)) return [];

  const places: GeocodedPlace[] = [];
  const seen = new Set<string>();

  for (const row of locations) {
    const place = toPlace(row);
    // Tas pats adresas kartojasi skirtingais įrašais; sąraše to matyti nereikia.
    if (!place || place.formattedAddress === "" || seen.has(place.formattedAddress)) continue;
    seen.add(place.formattedAddress);
    places.push(place);
    if (places.length >= limit) break;
  }

  return places;
}

/**
 * Pirmas rastas taškas, arba `null`, jei adresas neatpažintas.
 *
 * Naudojama tik tada, kai vartotojas varianto nepasirinko. Tada spėjimas
 * paženklinamas, o ne pateikiamas kaip tiesa.
 */
export function firstPlace(payload: unknown): GeocodedPlace | null {
  return placeSuggestions(payload, 1)[0] ?? null;
}

/**
 * PTV maršruto atsakymas į įvertį.
 *
 * Mokesčiai imami iš `convertedPrice` — PTV pats perskaičiuoja zlotus, kronas
 * ir kitas valiutas į eurus. Savo kurso čia netaikome: PTV kursas eina kartu
 * su jų tarifais, tad maišyti šaltinius būtų blogiau.
 */
export function routeEstimate(payload: unknown): RouteEstimate | null {
  if (typeof payload !== "object" || payload === null) return null;
  const source = payload as Record<string, unknown>;

  const metres = decimal(source.distance);
  if (metres === null) return null;

  const seconds = decimal(source.travelTime) ?? 0;

  const toll = source.toll as Record<string, unknown> | undefined;
  const costs = toll?.costs as Record<string, unknown> | undefined;
  const countries = Array.isArray(costs?.countries) ? costs.countries : [];

  const byCountry: CountryToll[] = [];
  for (const row of countries) {
    if (typeof row !== "object" || row === null) continue;
    const entry = row as Record<string, unknown>;
    const code = text(entry.countryCode);
    const converted = entry.convertedPrice as Record<string, unknown> | undefined;
    const price = decimal(converted?.price);
    if (code === null || price === null) continue;
    byCountry.push({ countryCode: code, euroCents: Math.round(price * 100) });
  }

  return {
    km: Math.round((metres / 1000) * 100) / 100,
    travelHours: Math.round((seconds / 3600) * 10) / 10,
    tollCents: byCountry.reduce((total, row) => total + row.euroCents, 0),
    byCountry,
    violated: source.violated === true,
  };
}

/** Reiso formos laukai, kuriuos užpildo maršrutas. */
export interface RouteFill {
  paid_km: string;
  bridges_cents: string;
  legKm: string;
}

/**
 * Įvertis į formos reikšmes.
 *
 * `days` čia nėra sąmoningai: kelio laikas nėra reiso trukmė. Vairuotojas
 * miega, laukia pakrovimo ir stovi pasienyje, o furos paros kaštai skaičiuojami
 * nuo parų — todėl spėta trukmė tyliai iškreiptų pelną. Trukmę siūlome
 * atskirai, kad žmogus ją patvirtintų.
 */
export function routeFill(estimate: RouteEstimate): RouteFill {
  return {
    paid_km: estimate.km.toFixed(2),
    bridges_cents: (estimate.tollCents / 100).toFixed(2),
    legKm: estimate.km.toFixed(2),
  };
}

/** Kiek parų siūlyti: kelio laikas plius poilsis, apvalinant į viršų. */
export function suggestedDays(travelHours: number): number {
  // Vairuotojui leidžiama vairuoti ~9 val. per parą, tad para kelio yra ~9 val.
  return Math.max(1, Math.ceil(travelHours / 9));
}
