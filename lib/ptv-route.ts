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

/** Pirmas rastas taškas, arba `null`, jei adresas neatpažintas. */
export function firstPlace(payload: unknown): GeocodedPlace | null {
  if (typeof payload !== "object" || payload === null) return null;
  const locations = (payload as { locations?: unknown }).locations;
  if (!Array.isArray(locations) || locations.length === 0) return null;

  const first = locations[0] as Record<string, unknown>;
  const position = first.referencePosition as Record<string, unknown> | undefined;
  const latitude = decimal(position?.latitude);
  const longitude = decimal(position?.longitude);
  if (latitude === null || longitude === null) return null;

  return {
    latitude,
    longitude,
    formattedAddress: text(first.formattedAddress) ?? "",
    locationType: text(first.locationType) ?? "",
  };
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
