"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCents } from "../../lib/money";
import { deleteTrip, listTrips, type TripSummary } from "../../lib/trips";

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("lt-LT").format(new Date(`${date}T00:00:00`));
}

export function TripList() {
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [removing, setRemoving] = useState("");

  async function remove(trip: TripSummary) {
    if (!confirm(`Ištrinti reisą ${trip.tripNumber}? Atstatyti nebus galima.`)) return;
    setRemoving(trip.id);
    setError("");
    try {
      await deleteTrip(trip.id);
      setTrips((current) => current.filter((t) => t.id !== trip.id));
    } catch {
      setError("Nepavyko ištrinti reiso. Patikrinkite ryšį ir bandykite dar kartą.");
    } finally {
      setRemoving("");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadTrips() {
      try {
        const loadedTrips = await listTrips();
        if (!cancelled) setTrips(loadedTrips);
      } catch {
        if (!cancelled) setError("Nepavyko užkrauti reisų. Patikrinkite ryšį ir bandykite dar kartą.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadTrips();
    return () => { cancelled = true; };
  }, [attempt]);

  if (loading) return <p role="status">Kraunami reisai…</p>;

  if (error) {
    return <div>
      <p role="alert" className="text-red-700">{error}</p>
      <button type="button" className="mt-3 underline" onClick={() => {
        setLoading(true);
        setError("");
        setAttempt((value) => value + 1);
      }}>Bandyti dar kartą</button>
    </div>;
  }

  if (!trips.length) {
    return <p className="rounded-2xl border border-dashed bg-white p-8 text-center text-slate-600">
      Išsaugotų reisų dar nėra. Sukurkite pirmą reisą ir čia matysite jo pelną.
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
              {formatCents(trip.profitCents)} {profitable ? "pelnas" : "nuostolis"}
            </p>
            <p className="text-sm text-slate-500">
              Marža {trip.marginPercent === null ? "—" : `${trip.marginPercent.toFixed(1)}%`} · {trip.profitPerKm === null ? "—" : `${trip.profitPerKm.toFixed(2)} €/km`}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t pt-4">
          <dl className="grid flex-1 grid-cols-2 gap-3 text-sm sm:max-w-md">
            <div><dt className="text-slate-500">Pajamos</dt><dd className="font-semibold">{formatCents(trip.revenueCents)}</dd></div>
            <div><dt className="text-slate-500">Kaštai</dt><dd className="font-semibold">{formatCents(trip.totalCostCents)}</dd></div>
          </dl>
          <div className="flex gap-4 text-sm">
            <Link href={`/trips/${trip.id}/edit`} className="underline">Redaguoti</Link>
            <button type="button" disabled={removing === trip.id} onClick={() => void remove(trip)} className="text-red-700 underline disabled:opacity-50">
              {removing === trip.id ? "Trinama…" : "Ištrinti"}
            </button>
          </div>
        </div>
      </li>;
    })}
  </ul>;
}
