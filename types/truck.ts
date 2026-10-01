import type { TruckProfile } from "../lib/truck-profile";

/**
 * Duomenų bazės `trucks` lentelės eilutė (#17).
 *
 * Kortelės laukai (`TruckProfile`, #164) neprivalomi ir tipe: kol migracija
 * `0011` nepaleista, duomenų bazė jų negrąžina visai, ir tipas turi tai sakyti.
 */
export interface Truck extends TruckProfile {
  id: string;
  plate: string;
  depreciation_cents: number;
  interest_cents: number;
  insurance_kasko_cents: number;
  insurance_civil_cents: number;
  insurance_cmr_cents: number;
  driver_salary_cents: number;
  per_diem_cents: number;
  repairs_cents: number;
  management_cents: number;
  trailer_monthly_cents: number;
  working_days_per_month: number;
  /** Svoris be krovinio, kg. `null` – nenurodyta, spėti negalima (#86). */
  empty_weight_kg: number | null;
  /** Leistina bendra masė, kg. `null` – nenurodyta. */
  total_permitted_weight_kg: number | null;
}

/** Nauja fura prieš duomenų bazės sugeneruojamą `id`. */
export type TruckInsert = Omit<Truck, "id">;
