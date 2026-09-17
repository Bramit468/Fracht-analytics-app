"use client";

import Link from "next/link";
import { useState } from "react";
import { formatCents } from "../../../lib/money";
import { calculateTripProfit } from "../../../lib/trip-profit";
import { TripForm, type TripDraft } from "./trip-form";

export default function NewTripPage() {
  const [trip, setTrip] = useState<TripDraft | null>(null);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 lg:py-12">
      <div className="mx-auto max-w-4xl">
        <Link
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-slate-950"
          href="/"
        >
          <span aria-hidden="true">←</span>
          Back to dashboard
        </Link>

        <header className="mb-8 mt-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
            Fracht Analytics
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">New trip</h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Enter the route, revenue, and operating costs. We will use these values to
            calculate the trip&apos;s profitability.
          </p>
        </header>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <TripForm onValid={setTrip} />
        </div>

        {trip && (
          (() => {
            const result = calculateTripProfit(trip);
            return (
          <div
            className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"
            role="status"
          >
            <p className="font-semibold">Trip data is ready for calculation.</p>
            <p className="mt-1 text-sm text-emerald-800">
              {trip.tripNumber}: {trip.origin} → {trip.destination}
            </p>
            <p className="mt-1 text-sm text-emerald-800">
              Revenue: {formatCents(trip.revenueCents)} · Truck: {trip.truckPlate}
            </p>
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-4">
              <span>Total cost: {formatCents(result.totalCostCents)}</span>
              <span className={result.profitCents < 0 ? "font-semibold text-red-700" : "font-semibold"}>
                Profit: {formatCents(result.profitCents)}
              </span>
              <span>Margin: {result.marginPercent === null ? "—" : `${result.marginPercent.toFixed(1)}%`}</span>
              <span>Profit/km: {result.profitPerKm === null ? "—" : `${result.profitPerKm.toFixed(2)} €`}</span>
            </div>
          </div>
            );
          })()
        )}
      </div>
    </main>
  );
}
