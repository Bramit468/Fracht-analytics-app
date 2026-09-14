/**
 * Reiso duomenų bazės eilučių tipai (#3).
 *
 * Laukų pavadinimai sutampa su lentelių stulpeliais (snake_case), nes būtent
 * tokie ateina iš Supabase. Skaičiavimo funkcijos `lib/calc.ts` naudoja savo,
 * camelCase tipus — jos sąmoningai nieko nežino apie duomenų bazę. Vertimas
 * tarp šitų dviejų formų daromas ten, kur reisas įrašomas ar nuskaitomas (#10).
 *
 * Migracija: supabase/migrations/0003_create_trips.sql
 * Modelis: docs/skaiciavimo-modelis.md
 */

/** Kaip gaunamos reiso pajamos. */
export type RevenueMode = "per_km" | "freight";

/**
 * Reiso eilutė.
 *
 * `rate_per_km` ir `freight_price_cents` yra pora, kurios vienas narys visada
 * tuščias: kai `revenue_mode` yra `per_km`, užpildytas `rate_per_km`, kitu
 * atveju — `freight_price_cents`. To reikalauja ir duomenų bazės apribojimas
 * `trips_revenue_mode_has_value`.
 */
export interface Trip {
  id: string;
  trip_number: string;
  origin: string;
  destination: string;
  /** ISO data, pvz. "2026-09-14". */
  trip_date: string;
  truck_id: string;

  /** Kiek parų truko reisas. */
  days: number;

  /** Apmokami kilometrai — nuo jų skaičiuojamos pajamos ir savikaina/km. */
  paid_km: number;
  /** Tušti kilometrai — degina kurą, bet pajamų neneša. */
  empty_km: number;

  fuel_l_per_100km: number;
  fuel_price: number;
  adblue_l_per_100km: number;
  adblue_price: number;

  bridges_cents: number;
  ferries_cents: number;
  tunnels_cents: number;
  parking_cents: number;

  revenue_mode: RevenueMode;
  rate_per_km: number | null;
  freight_price_cents: number | null;

  created_at: string;
}

/** Reiso atkarpa vienoje šalyje. */
export interface TripCountryLeg {
  id: string;
  trip_id: string;
  /** Turi sutapti su `country_tariffs.country`. */
  country: string;
  km: number;
}

/** Laukai, kuriuos paduoda vartotojas. `id` ir `created_at` sugeneruoja DB. */
export type TripInsert = Omit<Trip, "id" | "created_at">;

/** Atkarpa prieš įrašymą — `id` sugeneruoja DB, `trip_id` žinomas tik po įrašymo. */
export type TripCountryLegInsert = Omit<TripCountryLeg, "id" | "trip_id">;

/** Reisas kartu su savo atkarpomis. Tokį patogu paduoti į skaičiavimus. */
export interface TripWithLegs extends Trip {
  legs: TripCountryLeg[];
}
