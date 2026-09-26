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
  /**
   * Savikaina už apmokamą km: visi kaštai / visi apmokami km (#127).
   *
   * Tai skaičius, kuriuo deramasi: „dirbu už 1,05 €/km“ turi prasmę tik
   * žinant, kad kilometras kainuoja 0,92 €. `null`, kai km nėra.
   */
  costPerKm: number | null;
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
  const totalCostCents = sum((trip) => trip.totalCostCents);
  const paidKm = sum((trip) => trip.paidKm);

  return {
    tripCount: trips.length,
    revenueCents,
    totalCostCents,
    profitCents,
    marginPercent: revenueCents > 0 ? (profitCents / revenueCents) * 100 : null,
    profitPerKm: paidKm > 0 ? profitCents / 100 / paidKm : null,
    costPerKm: paidKm > 0 ? totalCostCents / 100 / paidKm : null,
  };
}
