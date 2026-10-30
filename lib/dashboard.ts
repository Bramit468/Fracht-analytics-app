import { calcProfitPerDay } from "./calc";
import type { TripSummary } from "./trips";

export interface DashboardStats {
  tripCount: number;
  revenueCents: number;
  totalCostCents: number;
  profitCents: number;
  /** Visų reisų įnašas: pajamos − kintami kaštai. Skirtumas iki pelno – pastovūs furos kaštai. */
  contributionCents: number;
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
  /** Visas pelnas / visos furų paros, centais (#179). `null`, kai parų nėra. */
  profitPerDayCents: number | null;
  /** Furų paros reisuose – kiek fura iš tikrųjų dirbo. */
  days: number;
  paidKm: number;
  emptyKm: number;
  /** Pajamos ir kaštai per parą – fura kainuoja paromis, todėl tai pagrindinis matas. */
  revenuePerDayCents: number | null;
  costPerDayCents: number | null;
  /** Pajamos už apmokamą km – tuo deramasi su užsakovu. */
  revenuePerKm: number | null;
  /** Tuščios ridos dalis nuo visos, %. */
  emptySharePercent: number | null;
}

/**
 * Žemiau šios sumos „pervežimas" yra ne pervežimas, o priemoka, paslauga ar
 * klaida (Telematikoje, pvz., 70 € užsakymas be km). Tokie reisai iškreiptų
 * €/km ir pelną per parą, todėl suvestinėje neskaičiuojami, bet parodomi.
 * Visų kitų užsakymų kaina ≥ 500 € (2026-10 duomenys).
 */
export const MIN_REALISTIC_REVENUE_CENTS = 20_000;

export function splitUnrealistic(trips: TripSummary[]): { realistic: TripSummary[]; unrealistic: TripSummary[] } {
  const realistic: TripSummary[] = [];
  const unrealistic: TripSummary[] = [];
  for (const trip of trips) (trip.revenueCents < MIN_REALISTIC_REVENUE_CENTS ? unrealistic : realistic).push(trip);
  return { realistic, unrealistic };
}

/**
 * Kiek furų parų išnaudota: reisų paros / (furos × kalendorinės dienos iki
 * šiandien). Ateities dienos nesiskaito – mėnesio viduryje užimtumas kitaip
 * atrodytų perpus mažesnis. `null`, kai nėra iš ko skaičiuoti.
 */
export function utilizationPercent(days: number, truckCount: number, from: string, to: string, today: string): number | null {
  const end = to < today ? to : today;
  const calendarDays = Math.round((Date.parse(end) - Date.parse(from)) / 86_400_000) + 1;
  if (!(truckCount > 0) || !(calendarDays > 0)) return null;
  return (days / (truckCount * calendarDays)) * 100;
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
  const contributionCents = sum((trip) => trip.contributionCents ?? 0);
  const totalCostCents = sum((trip) => trip.totalCostCents);
  const paidKm = sum((trip) => trip.paidKm);
  const emptyKm = sum((trip) => trip.emptyKm);
  const days = sum((trip) => trip.days);

  return {
    tripCount: trips.length,
    revenueCents,
    totalCostCents,
    profitCents,
    contributionCents,
    marginPercent: revenueCents > 0 ? (profitCents / revenueCents) * 100 : null,
    profitPerKm: paidKm > 0 ? profitCents / 100 / paidKm : null,
    costPerKm: paidKm > 0 ? totalCostCents / 100 / paidKm : null,
    profitPerDayCents: calcProfitPerDay(profitCents, days),
    days,
    paidKm,
    emptyKm,
    revenuePerDayCents: days > 0 ? Math.round(revenueCents / days) : null,
    costPerDayCents: days > 0 ? Math.round(totalCostCents / days) : null,
    revenuePerKm: paidKm > 0 ? revenueCents / 100 / paidKm : null,
    emptySharePercent: paidKm + emptyKm > 0 ? (emptyKm / (paidKm + emptyKm)) * 100 : null,
  };
}
