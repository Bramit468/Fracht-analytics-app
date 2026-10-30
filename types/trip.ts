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

import type { Truck as TruckCosts } from "../lib/calc";
import type { PerDiemDay } from "../lib/per-diem";
import type { StoredStop } from "../lib/stops";

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

  /**
   * Furos paros kaštai reiso išsaugojimo dieną (#38). Užpildo duomenų bazė,
   * todėl vėliau pataisyta fura seno reiso pelno nebekeičia.
   */
  truck_costs: TruckCosts;

  /**
   * Sustojimai su tipais (migracija 0012). Skaičiavimas jų kol kas nenaudoja:
   * jie išsaugomi ir pateikiami (`countStopsByType`). Senuose reisuose arba
   * kol migracija netaikyta lauko nėra.
   */
  stops?: StoredStop[];

  /**
   * Užsakovas (migracija 0014, #183). Neprivalomas; kol migracija netaikyta,
   * lauko nėra visai.
   */
  customer_id?: string | null;

  /** Sąskaitos ir apmokėjimo datos (migracija 0015, #185). */
  invoiced_on?: string | null;
  paid_on?: string | null;

  /**
   * Dienpinigiai pagal šalis (migracija 0016, #187), užfiksuoti įrašant:
   * pasikeitus normoms, senas reisas nepersiskaičiuoja. `null` – fiksuoti
   * furos dienpinigiai × paros.
   */
  per_diem_cents?: number | null;
  /** Kiekvienos dienos šalys ir suma – kad būtų matyti, iš ko ji gauta. */
  per_diem_days?: PerDiemDay[] | null;

  /** Telematikos OrderId, jei reisas importuotas (migracija 0019). */
  telematika_order_id?: string | null;
  /** Ką paskutinis importas įrašė (0021): skiriasi nuo įrašo – pataisyta ranka. */
  /** Su kuo lygintas krovinys (0023): paros ir įnašas centais. Iki migracijos lauko nėra. */
  alternative_days?: number;
  alternative_cents?: number;
  import_snapshot?: Pick<Trip, "trip_date" | "truck_id" | "days" | "paid_km" | "empty_km" | "freight_price_cents" | "bridges_cents" | "per_diem_cents"> | null;

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

/** Laukai, kuriuos paduoda vartotojas. Likusius užpildo DB. */
export type TripInsert = Omit<Trip, "id" | "created_at" | "truck_costs">;

/** Atkarpa prieš įrašymą — `id` sugeneruoja DB, `trip_id` žinomas tik po įrašymo. */
export type TripCountryLegInsert = Omit<TripCountryLeg, "id" | "trip_id">;

/** Reisas kartu su savo atkarpomis. Tokį patogu paduoti į skaičiavimus. */
export interface TripWithLegs extends Trip {
  legs: TripCountryLeg[];
}
