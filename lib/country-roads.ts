/**
 * Kelių mokesčiai pagal šalį (#125).
 *
 * Reisas saugo atkarpas — šalį ir kilometrus, — o įkainių žinynas kainą už tos
 * šalies kilometrą. Iš to jau skaičiuojami reiso kaštai, bet susumuota per visus
 * reisus to niekur nematyti.
 *
 * O tai yra atskiras klausimas: per kurią šalį važiuojame daugiausia ir kiek ta
 * šalis kainuoja. Nuo atsakymo priklauso, ar verta ieškoti aplinkkelio — PTV
 * variantų palyginimas (#84) kaip tik tokius ir randa.
 */

import type { CountryTariff, TripCountryLeg } from "./calc";

export interface CountryRoad {
  country: string;
  km: number;
  costCents: number;
}

export interface CountryRoadSummary extends CountryRoad {
  tripCount: number;
  /** Dalis nuo visų kelių kaštų. `null`, kai kaštų nėra. */
  costShare: number | null;
  /** Vidutinė kaina už kilometrą toje šalyje. `null`, kai km nėra. */
  centsPerKm: number | null;
}

/**
 * Vienos atkarpos kaina.
 *
 * Nežinoma šalis grąžina `null`, o ne nulį: `calc.ts` tokiu atveju meta klaidą,
 * nes ten skaičiuojamas reiso pelnas, o čia — apžvalga, ir dėl vieno keisto
 * įrašo neturi nukristi visa suvestinė. Bet tylus nulis ją pameluotų, todėl
 * tokios atkarpos rodomos atskirai.
 */
export function legCostCents(
  leg: TripCountryLeg,
  tariffs: Map<string, CountryTariff>,
): number | null {
  const tariff = tariffs.get(leg.country);
  if (!tariff) return null;

  return Math.round(
    (tariff.rateType === "per_km" ? tariff.rate * leg.km : tariff.rate) * 100,
  );
}

/** Vieno reiso atkarpos su kainomis. Nežinomos šalys pažymimos. */
export function tripRoadsByCountry(
  legs: TripCountryLeg[],
  tariffs: CountryTariff[],
): CountryRoad[] {
  const byCountry = new Map(tariffs.map((tariff) => [tariff.country, tariff]));

  return legs.map((leg) => ({
    country: leg.country,
    km: leg.km,
    costCents: legCostCents(leg, byCountry) ?? 0,
  }));
}

/** Šalys, brangiausia viršuje. Vienodos kainos — pagal pavadinimą. */
export function summarizeCountryRoads(
  trips: { roadByCountry: CountryRoad[] }[],
): CountryRoadSummary[] {
  const rows = new Map<string, { km: number; costCents: number; trips: number }>();

  for (const trip of trips) {
    // Ta pati šalis reise gali būti keliose atkarpose, bet reisas skaičiuojamas
    // vieną kartą: kitaip „per kiek reisų važiuota per Lenkiją“ būtų per didelis.
    const seen = new Set<string>();

    for (const road of trip.roadByCountry) {
      const row = rows.get(road.country) ?? { km: 0, costCents: 0, trips: 0 };
      row.km += road.km;
      row.costCents += road.costCents;
      if (!seen.has(road.country)) {
        row.trips += 1;
        seen.add(road.country);
      }
      rows.set(road.country, row);
    }
  }

  const totalCents = [...rows.values()].reduce((total, row) => total + row.costCents, 0);

  return [...rows.entries()]
    .map(([country, row]) => ({
      country,
      km: Math.round(row.km * 100) / 100,
      costCents: row.costCents,
      tripCount: row.trips,
      costShare: totalCents > 0 ? (row.costCents / totalCents) * 100 : null,
      centsPerKm: row.km > 0 ? row.costCents / row.km : null,
    }))
    .sort((a, b) => b.costCents - a.costCents || a.country.localeCompare(b.country));
}
