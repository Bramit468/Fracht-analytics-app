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
}

/** Nauja fura prieš duomenų bazės sugeneruojamą `id`. */
export type TruckInsert = Omit<Truck, "id">;
