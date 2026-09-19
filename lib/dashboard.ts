import type { TripSummary } from "./trips";

export interface DashboardStats {
  tripCount: number;
  revenueCents: number;
  totalCostCents: number;
  profitCents: number;
  averageMarginPercent: number | null;
  averageProfitPerKm: number | null;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function calculateDashboardStats(trips: TripSummary[]): DashboardStats {
  return {
    tripCount: trips.length,
    revenueCents: trips.reduce((total, trip) => total + trip.revenueCents, 0),
    totalCostCents: trips.reduce((total, trip) => total + trip.totalCostCents, 0),
    profitCents: trips.reduce((total, trip) => total + trip.profitCents, 0),
    averageMarginPercent: average(
      trips.flatMap((trip) => trip.marginPercent === null ? [] : [trip.marginPercent]),
    ),
    averageProfitPerKm: average(
      trips.flatMap((trip) => trip.profitPerKm === null ? [] : [trip.profitPerKm]),
    ),
  };
}
