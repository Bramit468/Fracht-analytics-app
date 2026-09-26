"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCents } from "../../lib/money";
import {
  EMPTY_FILTER,
  filterTrips,
  SORTS,
  sortTrips,
  tripPlates,
  type SortKey,
  type TripFilter,
} from "../../lib/trip-filter";
import { PERIODS, type PeriodKey } from "../../lib/trip-period";
import { csvFileName, tripsToCsv } from "../../lib/trip-export";
import { downloadCsv, todayForFileName } from "../download-csv";
import { deleteTrip, listTrips, type TripSummary } from "../../lib/trips";

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("lt-LT").format(new Date(`${date}T00:00:00`));
}

/** Paieška, atranka ir rikiavimas. Šimte reisų slinkti žemyn nebeišeina (#105). */
function Controls({
  filter,
  onFilter,
  sort,
  onSort,
  plates,
  shown,
  total,
  onExport,
}: {
  filter: TripFilter;
  onFilter: (next: TripFilter) => void;
  sort: SortKey;
  onSort: (next: SortKey) => void;
  plates: string[];
  shown: number;
  total: number;
  onExport: () => void;
}) {
  const select = "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm";

  return <div className="rounded-2xl border bg-white p-4 shadow-sm">
    <div className="flex flex-wrap gap-3">
      <label className="flex-1 text-sm">
        <span className="sr-only">Paieška</span>
        <input type="search" value={filter.query} onChange={(event) => onFilter({ ...filter, query: event.target.value })} placeholder="Reiso numeris, miestas arba fura" className="w-full min-w-48 rounded-xl border border-slate-300 px-3 py-2" />
      </label>
      <label className="text-sm">
        <span className="sr-only">Fura</span>
        <select value={filter.plate} onChange={(event) => onFilter({ ...filter, plate: event.target.value })} className={select}>
          <option value="">Visos furos</option>
          {plates.map((plate) => <option key={plate} value={plate}>{plate}</option>)}
        </select>
      </label>
      <label className="text-sm">
        <span className="sr-only">Laikotarpis</span>
        <select value={filter.period} onChange={(event) => onFilter({ ...filter, period: event.target.value as PeriodKey })} className={select}>
          {PERIODS.map((period) => <option key={period.key} value={period.key}>{period.label}</option>)}
        </select>
      </label>
      <label className="text-sm">
        <span className="sr-only">Rikiavimas</span>
        <select value={sort} onChange={(event) => onSort(event.target.value as SortKey)} className={select}>
          {SORTS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
      </label>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500">Rodoma {shown} iš {total} reisų.</p>
      <button type="button" onClick={onExport} disabled={shown === 0} className="text-sm font-semibold text-blue-600 underline disabled:opacity-50">
        Atsisiųsti Excel lentelei ({shown})
      </button>
    </div>
  </div>;
}

/**
 * Atsiunčia tai, kas matoma ekrane (#115).
 *
 * Iškeliamas ne visas sąrašas, o atrinktas: jei ieškojai vienos furos rugsėjį,
 * to ir reikia — kitaip failą tektų karpyti Excel'yje.
 */
function downloadTrips(trips: TripSummary[], today: string) {
  downloadCsv(csvFileName(today), tripsToCsv(trips));
}

export function TripList() {
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [removing, setRemoving] = useState("");
  const [filter, setFilter] = useState<TripFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<SortKey>("date");

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

  const shown = sortTrips(
    filterTrips(trips, filter, new Date().toISOString().slice(0, 10)),
    sort,
  );

  return <div className="space-y-4">
    <Controls filter={filter} onFilter={setFilter} sort={sort} onSort={setSort} plates={tripPlates(trips)} shown={shown.length} total={trips.length} onExport={() => downloadTrips(shown, todayForFileName())} />

    {shown.length === 0 ? <p className="rounded-2xl border border-dashed bg-white p-8 text-center text-slate-600">
      Pagal šią paiešką reisų nėra.
    </p> : <ul className="space-y-4">
    {shown.map((trip) => {
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
            {/* Tas pats maršrutas kartojasi kas savaitę (#129). */}
            <Link href={`/trips/new?copy=${trip.id}`} className="underline">Kopijuoti</Link>
            <button type="button" disabled={removing === trip.id} onClick={() => void remove(trip)} className="text-red-700 underline disabled:opacity-50">
              {removing === trip.id ? "Trinama…" : "Ištrinti"}
            </button>
          </div>
        </div>
      </li>;
    })}
    </ul>}
  </div>;
}
