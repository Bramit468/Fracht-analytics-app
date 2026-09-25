/** Duomenų bazės `trucks` lentelės eilutė (#17). */
export interface Truck {
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
