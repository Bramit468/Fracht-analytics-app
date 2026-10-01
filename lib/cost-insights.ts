/**
 * Kur galima sutaupyti: išvados iš faktinių kaštų (#171).
 *
 * Lentelės parodo skaičius, bet palyginti 22 furas akimis sunku. Čia tie patys
 * telematikos duomenys paverčiami konkrečiais teiginiais su suma eurais.
 *
 * Sumos – laikotarpio **dydžio matas**, ne pažadas: furos veža skirtingus
 * krovinius skirtingais keliais. Todėl ribos parinktos taip, kad triukšmas
 * (trumpa rida, keli centai skirtumo) išvadų negamintų, o skirtingų rūšių
 * sumos nesudedamos – jos iš dalies persidengia.
 */

import { savingsAtCheapestCents, type FuelPriceRow } from "./fuel-prices";
import type { ActualCosts } from "./telematics-costs";

/** Mažiau ridos – sąnaudos per daug priklauso nuo vieno pylimo ar kalno. */
export const MIN_KM_FOR_CONSUMPTION = 1000;
/** Kiek procentų virš tipinės parko furos jau verta žiūrėti. */
export const CONSUMPTION_EXCESS_RATIO = 0.1;
/** Sąnaudoms palyginti reikia bent tiek furų, kitaip „tipinės“ nėra. */
export const MIN_TRUCKS_FOR_BENCHMARK = 3;
/** Mažesnis kainos skirtumas yra kortelių nuolaidų ir kurso triukšmas. */
export const PRICE_EXCESS_EUR_PER_L = 0.03;
/** Mažesnės sumos sąraše tik trukdytų. */
export const MIN_INSIGHT_CENTS = 5_000;

export type InsightKind = "consumption" | "price" | "country";

export interface Insight {
  kind: InsightKind;
  /** Fura, kai išvada apie vieną furą. */
  plate: string | null;
  title: string;
  detail: string;
  /** Laikotarpio suma centais. */
  cents: number;
}

function decimal(value: number, digits: number): string {
  return value.toLocaleString("lt-LT", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Svertinė parko kuro kaina: visa suma / visi litrai. `null` – kuras nepirktas. */
export function fleetFuelPricePerL(byCountry: FuelPriceRow[]): number | null {
  const litres = byCountry.reduce((total, row) => total + row.litres, 0);
  const cents = byCountry.reduce((total, row) => total + row.costCents, 0);
  return litres > 0 ? cents / 100 / litres : null;
}

/**
 * Furos, kurios naudoja daugiau kuro nei tipinė parko fura.
 *
 * Lyginama su mediana, ne vidurkiu: viena labai godi fura vidurkį patrauktų į
 * save ir pati atrodytų mažiau išsiskirianti.
 */
function consumptionInsights(rows: ActualCosts[], fleetPrice: number | null): Insight[] {
  const eligible = rows.filter(
    (row) => row.km >= MIN_KM_FOR_CONSUMPTION && row.litresPer100Km !== null && row.litresPer100Km > 0,
  );
  if (eligible.length < MIN_TRUCKS_FOR_BENCHMARK) return [];

  const typical = median(eligible.map((row) => row.litresPer100Km as number));
  const insights: Insight[] = [];

  for (const row of eligible) {
    const own = row.litresPer100Km as number;
    if (own <= typical * (1 + CONSUMPTION_EXCESS_RATIO)) continue;

    const price = row.fuelPricePerL ?? fleetPrice;
    if (price === null) continue;

    const excessLitres = (row.km * (own - typical)) / 100;
    const cents = Math.round(excessLitres * price * 100);
    if (cents < MIN_INSIGHT_CENTS) continue;

    insights.push({
      kind: "consumption",
      plate: row.plate,
      title: `${row.plate} naudoja ${decimal(own, 1)} l/100 km – ${decimal(own - typical, 1)} l daugiau nei tipinė parko fura`,
      detail:
        `Tipinė parko fura – ${decimal(typical, 1)} l/100 km. Per ${Math.round(row.km).toLocaleString("lt-LT")} km ` +
        `tai ${Math.round(excessLitres).toLocaleString("lt-LT")} l kuro daugiau. Verta patikrinti vairavimą, ` +
        `padangas, tuščią eigą ir kokius krovinius ši fura veža.`,
      cents,
    });
  }

  return insights;
}

/** Furos, kurios už litrą moka daugiau nei parkas vidutiniškai. */
function priceInsights(rows: ActualCosts[], fleetPrice: number | null): Insight[] {
  if (fleetPrice === null) return [];
  const insights: Insight[] = [];

  for (const row of rows) {
    const own = row.fuelPricePerL;
    if (own === null || own <= 0 || own - fleetPrice < PRICE_EXCESS_EUR_PER_L) continue;

    const litres = row.dieselCents / 100 / own;
    const cents = Math.round(litres * (own - fleetPrice) * 100);
    if (cents < MIN_INSIGHT_CENTS) continue;

    insights.push({
      kind: "price",
      plate: row.plate,
      title: `${row.plate} moka ${decimal(own, 3)} €/l – ${decimal(own - fleetPrice, 3)} € daugiau nei parkas`,
      detail:
        `Parko vidutinė kaina – ${decimal(fleetPrice, 3)} €/l. Tikėtina, kad šios furos vairuotojas ` +
        `pila ne tinklo ar brangesnėse stotelėse.`,
      cents,
    });
  }

  return insights;
}

/**
 * Kiek kainavo kuras ne pigiausioje šalyje. Suma ta pati, kurią rodo kuro
 * kainų lentelė (`savingsAtCheapestCents`), kad puslapyje nebūtų dviejų
 * skirtingų skaičių tam pačiam dalykui.
 */
function countryInsight(byCountry: FuelPriceRow[]): Insight[] {
  const cents = savingsAtCheapestCents(byCountry);
  if (cents < MIN_INSIGHT_CENTS) return [];

  // Pirkimai be šalies suma įskaičiuoti, bet pavadinti jų nėra kaip (#173).
  const known = byCountry.filter((row) => row.key !== "" && row.pricePerL !== null && row.litres > 0);
  const price = (row: FuelPriceRow) => row.pricePerL as number;
  const cheapest = known.reduce((best, row) => (price(row) < price(best) ? row : best));
  const dearest = known.reduce((worst, row) => (price(row) > price(worst) ? row : worst));
  const title =
    cheapest === dearest
      ? `Kuras ${cheapest.key} – ${decimal(price(cheapest), 3)} €/l, kiti pylimai brangesni`
      : `Kuras pigiausias – ${cheapest.key} (${decimal(price(cheapest), 3)} €/l), brangiausias – ${dearest.key} (${decimal(price(dearest), 3)} €/l)`;

  return [
    {
      kind: "country",
      plate: null,
      title,
      detail:
        `Tiek kainuotų viską pirkti pigiausios šalies kaina. Visko nesutaupysite – dalis pylimų ` +
        `neišvengiami ten, kur fura yra, – bet planuojant pylimus pigesnėse šalyse dalį galima.`,
      cents,
    },
  ];
}

/** Visos išvados, didžiausia suma viršuje. */
export function costInsights(rows: ActualCosts[], byCountry: FuelPriceRow[]): Insight[] {
  const fleetPrice = fleetFuelPricePerL(byCountry);

  return [
    ...consumptionInsights(rows, fleetPrice),
    ...priceInsights(rows, fleetPrice),
    ...countryInsight(byCountry),
  ].sort((a, b) => b.cents - a.cents);
}
