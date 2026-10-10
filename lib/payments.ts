/**
 * Apmokėjimai (#185): kuris užsakovas vėluoja mokėti.
 *
 * Pelningas reisas, už kurį sumokama po 90 dienų, finansuojamas iš savo
 * kišenės: kuras, keliai ir atlyginimai sumokėti jau seniai. Todėl šalia pelno
 * reikia matyti ir tai, kaip greitai jis virsta pinigais.
 *
 * Pradelsimas skaičiuojamas tik žinant terminą. Jo nespėjame: „30 dienų“ kaip
 * numatytasis padarytų vėluojančiu klientą, su kuriuo sutarta 60.
 */

import { daysUntil } from "./truck-profile";

export type PaymentStatus =
  /** Sąskaita dar neišrašyta – lyginti nėra nuo ko. */
  | "not_invoiced"
  /** Laukiama, terminas nepraėjęs arba nežinomas. */
  | "open"
  | "overdue"
  | "paid"
  | "paid_late";

export interface TripPayment {
  invoicedOn: string | null;
  paidOn: string | null;
  /** Užsakovo terminas dienomis. `null` – nežinomas. */
  termsDays: number | null;
}

export interface PaymentState {
  status: PaymentStatus;
  /** Mokėjimo terminas. `null` – nėra sąskaitos arba termino. */
  dueOn: string | null;
  /** Kiek dienų po termino (sumokėta vėliau arba vis dar nesumokėta). */
  daysLate: number | null;
}

/** Data + dienos, ISO formatu. */
export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function paymentState(payment: TripPayment, today: string): PaymentState {
  const { invoicedOn, paidOn, termsDays } = payment;
  const dueOn = invoicedOn !== null && termsDays !== null ? addDays(invoicedOn, termsDays) : null;

  if (paidOn !== null) {
    // Sumokėta be sąskaitos datos (avansas ar neužpildyta) – laiku ar ne, nežinia.
    const late = dueOn === null ? null : daysUntil(dueOn, paidOn);
    const daysLate = late === null ? null : Math.max(0, -late);
    return { status: daysLate !== null && daysLate > 0 ? "paid_late" : "paid", dueOn, daysLate };
  }

  if (invoicedOn === null) return { status: "not_invoiced", dueOn: null, daysLate: null };
  if (dueOn === null) return { status: "open", dueOn: null, daysLate: null };

  const left = daysUntil(dueOn, today);
  if (left !== null && left < 0) return { status: "overdue", dueOn, daysLate: -left };
  return { status: "open", dueOn, daysLate: null };
}

export interface PaymentTrip extends TripPayment {
  /** Sąskaitos suma – reiso pajamos centais (be PVM, kaip jos įvestos). */
  revenueCents: number;
}

export interface PaymentSummary {
  /** Išrašyta, bet dar nesumokėta. */
  openCents: number;
  /** Iš jų – po termino. */
  overdueCents: number;
  overdueCount: number;
  paidCount: number;
  paidLateCount: number;
  /**
   * Vidutiniškai dienų nuo sąskaitos iki apmokėjimo, sveriant suma: didelė
   * sąskaita, sumokėta po 90 dienų, svarbiau nei smulki – po 10.
   * `null` – nėra apmokėtų sąskaitų su abiem datomis.
   */
  avgDaysToPay: number | null;
}

export function summarizePayments(trips: PaymentTrip[], today: string): PaymentSummary {
  const summary: PaymentSummary = {
    openCents: 0,
    overdueCents: 0,
    overdueCount: 0,
    paidCount: 0,
    paidLateCount: 0,
    avgDaysToPay: null,
  };
  let weightedDays = 0;
  let weight = 0;

  for (const trip of trips) {
    const state = paymentState(trip, today);
    if (state.status === "open" || state.status === "overdue") summary.openCents += trip.revenueCents;
    if (state.status === "overdue") {
      summary.overdueCents += trip.revenueCents;
      summary.overdueCount += 1;
    }
    if (state.status === "paid" || state.status === "paid_late") {
      summary.paidCount += 1;
      if (state.status === "paid_late") summary.paidLateCount += 1;
      const days = trip.invoicedOn !== null && trip.paidOn !== null ? daysUntil(trip.paidOn, trip.invoicedOn) : null;
      if (days !== null && trip.revenueCents > 0) {
        weightedDays += days * trip.revenueCents;
        weight += trip.revenueCents;
      }
    }
  }

  summary.avgDaysToPay = weight > 0 ? weightedDays / weight : null;
  return summary;
}

export function paymentStateText(state: PaymentState): string | null {
  switch (state.status) {
    case "overdue":
      return `Vėluoja ${state.daysLate} d.`;
    case "paid_late":
      return `Sumokėta ${state.daysLate} d. pavėlavus`;
    case "paid":
      return "Sumokėta";
    case "open":
      return state.dueOn ? `Laukiama iki ${state.dueOn}` : "Laukiama apmokėjimo";
    case "not_invoiced":
      return null;
  }
}
