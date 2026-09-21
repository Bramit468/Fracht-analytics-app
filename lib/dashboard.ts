import type { TripSummary } from "./trips";

export interface DashboardStats {
  tripCount: number;
  revenueCents: number;
  totalCostCents: number;
  profitCents: number;
  /** Visų reisų marža: visas pelnas / visos pajamos. null, kai pajamų nėra. */
  marginPercent: number | null;
  /** Visų reisų pelnas už km: visas pelnas / visi apmokami km. null, kai km nėra. */
  profitPerKm: number | null;
}

/**
 * Suvestinė skaičiuojama nuo bendrų sumų, o ne kaip atskirų reisų vidurkis.
 * Vidurkis meluotų: 200 EUR reisas jame svertų tiek pat, kiek 12 000 EUR reisas.
 */
export function calculateDashboardStats(trips: TripSummary[]): DashboardStats {
  const sum = (pick: (trip: TripSummary) => number) =>
    trips.reduce((total, trip) => total + pick(trip), 0);

  const revenueCents = sum((trip) => trip.revenueCents);
  const profitCents = sum((trip) => trip.profitCents);
  const paidKm = sum((trip) => trip.paidKm);

  return {
    tripCount: trips.length,
    revenueCents,
    totalCostCents: sum((trip) => trip.totalCostCents),
    profitCents,
    marginPercent: revenueCents > 0 ? (profitCents / revenueCents) * 100 : null,
    profitPerKm: paidKm > 0 ? profitCents / 100 / paidKm : null,
  };
}
