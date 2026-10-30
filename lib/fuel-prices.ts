/**
 * Kuro kainos pagal šalį ir mėnesį (#139).
 *
 * `Supplies` jau atneša kiekvieną pirkimą su litrais, suma ir šalimi, bet
 * puslapis rodo tik bendrą sumą. O kuras yra apie ketvirtadalis reiso kaštų, ir
 * kaina tarp šalių skiriasi dešimtimis centų už litrą — tai pinigai, kuriuos
 * galima sutaupyti vien pasirinkus, kur pilti.
 *
 * Kaina skaičiuojama **svertinė**: visa suma dalinama iš visų litrų. Paprastas
 * kainų vidurkis meluotų — penkiasdešimt litrų brangioje stotelėje jame svertų
 * tiek pat, kiek pilnas bakas pigioje.
 */

import { iso2FromIso3 } from "./per-diem-norms";
import type { Supply } from "./telematics-costs";

export interface FuelPriceRow {
  /** Šalis arba mėnuo — priklauso nuo pjūvio. */
  key: string;
  litres: number;
  costCents: number;
  purchases: number;
  /** Svertinė kaina už litrą. `null`, kai litrų nėra. */
  pricePerL: number | null;
}

function group(supplies: Supply[], keyOf: (supply: Supply) => string): FuelPriceRow[] {
  const rows = new Map<string, { litres: number; costCents: number; purchases: number }>();

  for (const supply of supplies) {
    // Tik dyzelinas ir tik tada, kai žinomi litrai: be jų kainos už litrą
    // neišvesi, o įtraukus sumą be litrų vidurkis pasislinktų.
    if (supply.kind !== "diesel") continue;
    if (supply.quantity === null || !(supply.quantity > 0)) continue;

    const key = keyOf(supply);
    const row = rows.get(key) ?? { litres: 0, costCents: 0, purchases: 0 };
    row.litres += supply.quantity;
    row.costCents += supply.costCents;
    row.purchases += 1;
    rows.set(key, row);
  }

  return [...rows.entries()].map(([key, row]) => ({
    key,
    litres: Math.round(row.litres * 100) / 100,
    costCents: row.costCents,
    purchases: row.purchases,
    pricePerL: row.litres > 0 ? row.costCents / 100 / row.litres : null,
  }));
}

/** Šalys, pigiausia viršuje. Nenurodyta šalis lieka gale. */
export function fuelPricesByCountry(supplies: Supply[]): FuelPriceRow[] {
  return group(supplies, (supply) => supply.country ?? "").sort((a, b) => {
    if (a.key === "") return 1;
    if (b.key === "") return -1;
    return (a.pricePerL ?? 0) - (b.pricePerL ?? 0) || a.key.localeCompare(b.key);
  });
}

/** Mėnesiai chronologiškai — kad matytųsi, ar kaina kyla. */
export function fuelPricesByMonth(supplies: Supply[]): FuelPriceRow[] {
  return group(supplies, (supply) => supply.date.slice(0, 7)).sort((a, b) =>
    a.key.localeCompare(b.key),
  );
}

/**
 * Kiek būtų sutaupyta perkant visą kurą pigiausios šalies kaina.
 *
 * Tai ne pažadas, o dydžio matas: dalis pylimų neišvengiami ten, kur fura tuo
 * metu yra. Bet jei skirtumas siekia tūkstančius, verta planuoti pylimus.
 *
 * Pirkimai be šalies įskaičiuojami į bendrą sumą ir litrus – už juos irgi
 * sumokėta. Bet pigiausia kaina imama tik iš žinomų šalių: kaina „niekur“
 * nėra vieta, kur būtų galima nuvažiuoti pilti (#173).
 */
export function savingsAtCheapestCents(rows: FuelPriceRow[]): number {
  const priced = rows.filter((row) => row.pricePerL !== null && row.litres > 0);
  const known = priced.filter((row) => row.key !== "");
  if (priced.length < 2 || known.length === 0) return 0;

  const cheapest = known.reduce((best, row) =>
    (row.pricePerL ?? 0) < (best.pricePerL ?? 0) ? row : best,
  );

  const totalCents = priced.reduce((total, row) => total + row.costCents, 0);
  const totalLitres = priced.reduce((total, row) => total + row.litres, 0);

  return Math.max(0, Math.round(totalCents - totalLitres * (cheapest.pricePerL ?? 0) * 100));
}

/**
 * Mažiau litrų šalyje – kaina nepatikima (vienas pylimas gali būti brangi
 * stotelė), todėl tokiai šaliai imamas viso parko vidurkis.
 */
export const MIN_COUNTRY_LITRES = 500;

export interface RouteFuelRow {
  countryCode: string;
  km: number;
  pricePerL: number;
  /** Šaliai pylimų per mažai – imtas viso parko vidurkis. */
  fleetAverage: boolean;
}

export interface RouteFuelPrice {
  /** Kaina pagal km kiekvienoje šalyje, 4 skaitmenys po kablelio. */
  pricePerL: number;
  rows: RouteFuelRow[];
}

/**
 * Kuro kaina reisui pagal šalis, per kurias jis eina: kiekvienos šalies įmonės
 * pylimų kaina, sverta km toje šalyje. Furos praėjusio mėnesio kaina čia
 * netinka – ji rodo, kur fura pylėsi anksčiau, o ne kur pilsis šį kartą.
 *
 * `prices` – `fuelPricesByCountry` (Telematikos šalys ISO3), `kmByCountry` – PTV
 * (ISO2). `null`, kai nėra nei km, nei jokios kainos.
 */
export function routeFuelPrice(
  kmByCountry: { countryCode: string; km: number }[],
  prices: FuelPriceRow[],
): RouteFuelPrice | null {
  const priced = prices.filter((row) => row.pricePerL !== null && row.litres > 0);
  const litres = priced.reduce((total, row) => total + row.litres, 0);
  const totalKm = kmByCountry.reduce((total, row) => total + row.km, 0);
  if (!(litres > 0) || !(totalKm > 0)) return null;
  const fleet = priced.reduce((total, row) => total + row.costCents, 0) / 100 / litres;

  const byCountry = new Map<string, number>();
  for (const row of priced) {
    if (row.key === "" || row.litres < MIN_COUNTRY_LITRES) continue;
    byCountry.set(iso2FromIso3(row.key) ?? row.key.toUpperCase(), row.pricePerL as number);
  }

  const rows = kmByCountry.map(({ countryCode, km }) => {
    const price = byCountry.get(countryCode.toUpperCase());
    return { countryCode, km, pricePerL: price ?? fleet, fleetAverage: price === undefined };
  });
  const weighted = rows.reduce((total, row) => total + row.km * row.pricePerL, 0) / totalKm;
  return { pricePerL: Math.round(weighted * 10000) / 10000, rows };
}
