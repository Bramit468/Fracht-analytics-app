"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { calculateDashboardStats, type DashboardStats } from "../lib/dashboard";
import { formatCents } from "../lib/money";
import { filterByPeriod, PERIODS, type PeriodKey } from "../lib/trip-period";
import { listTrips, type TripSummary } from "../lib/trips";
import { summarizeByTruck } from "../lib/truck-profit";

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function formatPerKm(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(2)} €/km`;
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("lt-LT", { day: "2-digit", month: "short" }).format(new Date(`${date}T00:00:00`));
}

interface StatCardProps {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "positive" | "negative";
}

function StatCard({ label, value, detail, tone = "neutral" }: StatCardProps) {
  const accent = tone === "positive" ? "bg-emerald-500" : tone === "negative" ? "bg-red-500" : "bg-blue-500";
  const valueColor = tone === "positive" ? "text-emerald-700" : tone === "negative" ? "text-red-700" : "text-slate-950";

  return <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <span className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
    <dt className="text-sm font-medium text-slate-500">{label}</dt>
    <dd className={`mt-2 text-2xl font-bold tracking-tight xl:text-3xl ${valueColor}`}>{value}</dd>
    <p className="mt-2 text-xs text-slate-400">{detail}</p>
  </div>;
}

function ProfitabilityBars({ stats, periodLabel }: { stats: DashboardStats; periodLabel: string }) {
  const maximum = Math.max(stats.revenueCents, stats.totalCostCents, 1);
  const revenueWidth = `${Math.max((stats.revenueCents / maximum) * 100, stats.revenueCents ? 3 : 0)}%`;
  const costWidth = `${Math.max((stats.totalCostCents / maximum) * 100, stats.totalCostCents ? 3 : 0)}%`;

  return <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex items-start justify-between gap-4">
      <div><h3 className="font-semibold">Pajamos ir kaštai</h3><p className="mt-1 text-sm text-slate-500">{periodLabel}</p></div>
      <span className={`rounded-full px-3 py-1 text-xs font-bold ${stats.profitCents >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{stats.profitCents >= 0 ? "Pelninga" : "Nuostolis"}</span>
    </div>
    <div className="mt-7 space-y-6">
      <div><div className="mb-2 flex justify-between text-sm"><span className="font-medium text-slate-600">Pajamos</span><strong>{formatCents(stats.revenueCents)}</strong></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: revenueWidth }} /></div></div>
      <div><div className="mb-2 flex justify-between text-sm"><span className="font-medium text-slate-600">Kaštai iš viso</span><strong>{formatCents(stats.totalCostCents)}</strong></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-500" style={{ width: costWidth }} /></div></div>
    </div>
    <dl className="mt-8 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5">
      <div><dt className="text-xs uppercase tracking-wide text-slate-400">Marža</dt><dd className="mt-1 text-lg font-bold">{formatPercent(stats.marginPercent)}</dd></div>
      <div><dt className="text-xs uppercase tracking-wide text-slate-400">Pelnas už km</dt><dd className="mt-1 text-lg font-bold">{formatPerKm(stats.profitPerKm)}</dd></div>
    </dl>
  </div>;
}

function RecentTrips({ trips }: { trips: TripSummary[] }) {
  return <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6"><div><h3 className="font-semibold">Paskutiniai reisai</h3><p className="mt-1 text-sm text-slate-500">Naujausi išsaugoti reisai</p></div><Link href="/trips" className="text-sm font-semibold text-blue-600 hover:text-blue-700">Rodyti visus</Link></div>
    <div className="divide-y divide-slate-100">
      {trips.slice(0, 5).map((trip) => <div key={trip.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 sm:grid-cols-[90px_minmax(0,1fr)_120px_120px] sm:px-6">
        <span className="hidden text-sm text-slate-400 sm:block">{formatDate(trip.tripDate)}</span>
        <div className="min-w-0"><p className="truncate font-semibold">{trip.tripNumber} · {trip.truckPlate}</p><p className="truncate text-sm text-slate-500">{trip.origin} → {trip.destination}</p></div>
        <span className="hidden text-right text-sm font-medium text-slate-600 sm:block">{formatCents(trip.revenueCents)}</span>
        <strong className={`text-right ${trip.profitCents >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCents(trip.profitCents)}</strong>
      </div>)}
    </div>
  </div>;
}

function LossAlerts({ trips }: { trips: TripSummary[] }) {
  const losses = trips.filter((trip) => trip.profitCents < 0).sort((a, b) => a.profitCents - b.profitCents);
  return <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex items-center justify-between gap-4"><div><h3 className="font-semibold">Reikia dėmesio</h3><p className="mt-1 text-sm text-slate-500">Nuostolingi reisai</p></div><span className={`grid size-10 place-items-center rounded-full text-sm font-bold ${losses.length ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{losses.length}</span></div>
    {losses.length ? <ul className="mt-5 space-y-3">{losses.slice(0, 4).map((trip) => <li key={trip.id} className="rounded-xl bg-red-50 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{trip.tripNumber}</p><p className="truncate text-sm text-slate-500">{trip.origin} → {trip.destination}</p></div><strong className="whitespace-nowrap text-red-700">{formatCents(trip.profitCents)}</strong></div></li>)}</ul> : <p className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-800">Nuostolingų reisų nėra.</p>}
  </div>;
}

/** Laikotarpio pasirinkimas. Liečia visą suvestinę, kad skaičiai nesiskirtų tarp kortelių (#103). */
function PeriodPicker({ value, onChange }: { value: PeriodKey; onChange: (key: PeriodKey) => void }) {
  return <div role="group" aria-label="Laikotarpis" className="flex flex-wrap gap-2">
    {PERIODS.map((period) => <button key={period.key} type="button" aria-pressed={period.key === value} onClick={() => onChange(period.key)} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${period.key === value ? "bg-slate-950 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{period.label}</button>)}
  </div>;
}

/** Kuri fura neša pinigus. Su dvidešimt dviem furomis iš reisų sąrašo to nesuskaičiuosi (#101). */
function TruckProfit({ trips, periodLabel }: { trips: TripSummary[]; periodLabel: string }) {
  const rows = summarizeByTruck(trips);

  return <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6"><div><h3 className="font-semibold">Furų pelningumas</h3><p className="mt-1 text-sm text-slate-500">{periodLabel}, pelningiausia viršuje</p></div><Link href="/trucks/kastai" className="text-sm font-semibold text-blue-600 hover:text-blue-700">Tikslinti kaštus</Link></div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400"><th className="px-5 py-3 font-medium sm:px-6">Fura</th><th className="px-3 py-3 text-right font-medium">Reisai</th><th className="px-3 py-3 text-right font-medium">Pajamos</th><th className="px-3 py-3 text-right font-medium">Pelnas</th><th className="px-3 py-3 text-right font-medium">Marža</th><th className="px-5 py-3 text-right font-medium sm:px-6">€/km</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => <tr key={row.plate}>
            <td className="px-5 py-3 font-mono sm:px-6">{row.plate}</td>
            <td className="px-3 py-3 text-right tabular-nums text-slate-500">{row.tripCount}</td>
            <td className="px-3 py-3 text-right tabular-nums text-slate-600">{formatCents(row.revenueCents)}</td>
            <td className={`px-3 py-3 text-right font-semibold tabular-nums ${row.profitCents >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCents(row.profitCents)}</td>
            <td className="px-3 py-3 text-right tabular-nums text-slate-600">{formatPercent(row.marginPercent)}</td>
            <td className="px-5 py-3 text-right tabular-nums text-slate-600 sm:px-6">{formatPerKm(row.profitPerKm)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400 sm:px-6">Didžioji kaštų dalis yra furos paros savikaina, todėl skirtumai tarp furų tiek verti, kiek tikslios jų savikainos.</p>
  </div>;
}

export function Dashboard() {
  const [allTrips, setAllTrips] = useState<TripSummary[]>([]);
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadDashboard() {
      try {
        const loadedTrips = await listTrips();
        if (!cancelled) setAllTrips(loadedTrips);
      } catch { if (!cancelled) setError("Nepavyko užkrauti suvestinės. Patikrinkite ryšį ir bandykite dar kartą."); }
      finally { if (!cancelled) setLoading(false); }
    }
    void loadDashboard();
    return () => { cancelled = true; };
  }, [attempt]);

  // Šiandiena imama piešimo metu: reisai užkraunami vieną kartą, o laikotarpis
  // keičiamas vietoje, be naujos užklausos.
  const trips = filterByPeriod(allTrips, period, new Date().toISOString().slice(0, 10));
  const stats = calculateDashboardStats(trips);

  if (loading) return <div role="status" className="space-y-5"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}</div><div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]"><div className="h-72 animate-pulse rounded-2xl bg-white" /><div className="h-72 animate-pulse rounded-2xl bg-white" /></div><span className="sr-only">Kraunama suvestinė…</span></div>;

  if (error) return <div className="rounded-2xl border border-red-200 bg-red-50 p-5"><p role="alert" className="text-red-800">{error}</p><button type="button" className="mt-3 font-semibold text-red-800 underline" onClick={() => { setLoading(true); setError(""); setAttempt((value) => value + 1); }}>Bandyti dar kartą</button></div>;

  if (!allTrips.length) return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm"><h3 className="text-lg font-semibold">Išsaugotų reisų dar nėra</h3><p className="mt-2 text-slate-500">Sukurkite arba importuokite pirmą reisą.</p><Link href="/trips/new" className="mt-5 inline-block rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">Sukurti pirmą reisą</Link></div>;

  // Tuščias laikotarpis nėra klaida, todėl mygtukai lieka matomi — kitaip
  // pasirinkus mėnesį be reisų nebūtų kaip grįžti atgal.
  if (!trips.length) return <div className="space-y-5">
    <PeriodPicker value={period} onChange={setPeriod} />
    <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500 shadow-sm">Šiuo laikotarpiu reisų nėra.</p>
  </div>;

  const profitTone = stats.profitCents >= 0 ? "positive" : "negative";
  const periodLabel = PERIODS.find((item) => item.key === period)?.label ?? "";

  return <div className="space-y-5">
    <PeriodPicker value={period} onChange={setPeriod} />
    <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Pajamos iš viso" value={formatCents(stats.revenueCents)} detail={`${stats.tripCount} reisai · ${periodLabel.toLowerCase()}`} />
      <StatCard label="Kaštai iš viso" value={formatCents(stats.totalCostCents)} detail="Kuras, keliai ir furos paros kaštai" />
      <StatCard label="Pelnas iš viso" value={formatCents(stats.profitCents)} detail="Pajamos minus kaštai" tone={profitTone} />
      <StatCard label="Pelnas už km" value={formatPerKm(stats.profitPerKm)} detail={`Marža ${formatPercent(stats.marginPercent)}`} tone={stats.profitPerKm !== null && stats.profitPerKm < 0 ? "negative" : "neutral"} />
    </dl>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
      <div className="space-y-5"><ProfitabilityBars stats={stats} periodLabel={periodLabel} /><RecentTrips trips={trips} /></div>
      <LossAlerts trips={trips} />
    </div>
    <TruckProfit trips={trips} periodLabel={periodLabel} />
  </div>;
}
