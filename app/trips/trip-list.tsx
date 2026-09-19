"use client";

import { useEffect, useState } from "react";
import { formatCents } from "../../lib/money";
import { listTrips, type TripSummary } from "../../lib/trips";

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("lt-LT").format(new Date(`${date}T00:00:00`));
}

export function TripList() {
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadTrips() {
      try {
        const loadedTrips = await listTrips();
        if (!cancelled) setTrips(loadedTrips);
      } catch {
        if (!cancelled) setError("Could not load trips. Check the connection and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadTrips();
    return () => { cancelled = true; };
  }, [attempt]);

  if (loading) return <p role="status">Loading trips…</p>;

  if (error) {
    return <div>
      <p role="alert" className="text-red-700">{error}</p>
      <button type="button" className="mt-3 underline" onClick={() => {
        setLoading(true);
        setError("");
        setAttempt((value) => value + 1);
      }}>Retry</button>
    </div>;
  }

  if (!trips.length) {
    return <p className="rounded-2xl border border-dashed bg-white p-8 text-center text-slate-600">
      No trips saved yet. Create the first trip to see its profit here.
    </p>;
  }

  return <ul className="space-y-4">
    {trips.map((trip) => {
      const profitable = trip.profitCents >= 0;
      return <li key={trip.id} className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">{formatDate(trip.tripDate)} · {trip.truckPlate}</p>
            <h2 className="mt-1 text-lg font-semibold">{trip.tripNumber}</h2>
            <p className="text-slate-700">{trip.origin} → {trip.destination}</p>
          </div>
          <div className="text-right">
            <p className={`text-xl font-bold ${profitable ? "text-green-700" : "text-red-700"}`}>
              {formatCents(trip.profitCents)} {profitable ? "profit" : "loss"}
            </p>
            <p className="text-sm text-slate-500">
              Margin {trip.marginPercent === null ? "—" : `${trip.marginPercent.toFixed(1)}%`} · {trip.profitPerKm === null ? "—" : `${trip.profitPerKm.toFixed(2)} €/km`}
            </p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm sm:max-w-md">
          <div><dt className="text-slate-500">Revenue</dt><dd className="font-semibold">{formatCents(trip.revenueCents)}</dd></div>
          <div><dt className="text-slate-500">Total cost</dt><dd className="font-semibold">{formatCents(trip.totalCostCents)}</dd></div>
        </dl>
      </li>;
    })}
  </ul>;
}
