"use client";

import { useEffect, useState } from "react";
import { calculateDashboardStats, type DashboardStats } from "../lib/dashboard";
import { formatCents } from "../lib/money";
import { listTrips } from "../lib/trips";

const emptyStats = calculateDashboardStats([]);

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function formatPerKm(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(2)} €/km`;
}

interface StatCardProps {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}

function StatCard({ label, value, tone = "neutral" }: StatCardProps) {
  const valueColor = tone === "positive"
    ? "text-emerald-700"
    : tone === "negative"
      ? "text-red-700"
      : "text-slate-950";

  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <dt className="text-sm font-medium text-slate-500">{label}</dt>
    <dd className={`mt-3 text-2xl font-bold tracking-tight ${valueColor}`}>{value}</dd>
  </div>;
}

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        const trips = await listTrips();
        if (!cancelled) setStats(calculateDashboardStats(trips));
      } catch {
        if (!cancelled) setError("Could not load dashboard. Check the connection and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDashboard();
    return () => { cancelled = true; };
  }, [attempt]);

  if (loading) {
    return <div role="status" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />
      ))}
      <span className="sr-only">Loading dashboard…</span>
    </div>;
  }

  if (error) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
      <p role="alert" className="text-red-800">{error}</p>
      <button type="button" className="mt-3 font-semibold text-red-800 underline" onClick={() => {
        setLoading(true);
        setError("");
        setAttempt((value) => value + 1);
      }}>Retry</button>
    </div>;
  }

  const profitTone = stats.profitCents >= 0 ? "positive" : "negative";

  return <>
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard label="Total trips" value={String(stats.tripCount)} />
      <StatCard label="Total revenue" value={formatCents(stats.revenueCents)} />
      <StatCard label="Total cost" value={formatCents(stats.totalCostCents)} />
      <StatCard label="Total profit" value={formatCents(stats.profitCents)} tone={profitTone} />
      <StatCard label="Average margin" value={formatPercent(stats.averageMarginPercent)} />
      <StatCard label="Average profit/km" value={formatPerKm(stats.averageProfitPerKm)} />
    </dl>
    {stats.tripCount === 0 && <p className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-slate-600">
      No trips saved yet. Add the first trip to fill this dashboard.
    </p>}
  </>;
}
