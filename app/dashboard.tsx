"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { calculateDashboardStats, MIN_REALISTIC_REVENUE_CENTS, splitUnrealistic, utilizationPercent, type DashboardStats } from "../lib/dashboard";
import { listCustomers, type Customer } from "../lib/customers";
import { costStructure } from "../lib/cost-structure";
import { getSupabaseClient } from "../lib/supabase";
import { formatCents } from "../lib/money";
import { summarizeCountryRoads } from "../lib/country-roads";
import { emptyKmByTruck, summarizeEmptyKm } from "../lib/empty-km";
import { monthlyStats, peakProfitCents } from "../lib/monthly";
import {
  countriesToCsv,
  monthsToCsv,
  reportFileName,
  routesToCsv,
  trucksToCsv,
} from "../lib/report-export";
import { downloadCsv, todayForFileName } from "./download-csv";
import type { ProfitGroup } from "../lib/group-profit";
import { comparePeriod, compareWithRange } from "../lib/period-compare";
import { summarizeByRoute } from "../lib/route-profit";
import { filterByRange, periodRange, precedingRange, PERIODS, type PeriodKey, type PeriodRange } from "../lib/trip-period";
import { listTrips, type TripSummary } from "../lib/trips";
import { summarizeByTruck } from "../lib/truck-profit";

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function formatPerKm(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(2)} €/km`;
}

function formatPerDay(cents: number | null): string {
  return cents === null ? "—" : formatCents(cents);
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("lt-LT", { day: "2-digit", month: "short" }).format(new Date(`${date}T00:00:00`));
}

interface StatCardProps {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "positive" | "negative";
  /** Pokytis prieš tokį pat ankstesnį laikotarpį (#113). */
  change?: { text: string; better: boolean } | null;
}

/**
 * Vienas rodiklis. Spalva – tik skaičiui, kai ji ką nors reiškia (pelnas,
 * nuostolis); spalvota juostelė kortelės krašte buvo puošmena be prasmės.
 */
function StatCard({ label, value, detail, tone = "neutral", change }: StatCardProps) {
  const valueColor = tone === "positive" ? "text-good" : tone === "negative" ? "text-bad" : "text-ink";

  return <div className="bg-surface px-5 py-4">
    <dt className="text-sm text-muted">{label}</dt>
    <dd className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${valueColor}`}>{value}</dd>
    <p className="mt-1 text-xs text-muted">
      {change && <span className={`mr-1.5 font-medium ${change.better ? "text-good" : "text-bad"}`}>{change.text}</span>}
      {detail}
    </p>
  </div>;
}

/** Pokytis žodžiais: „+12,4 % nei anksčiau“. Be atskaitos taško nerodoma nieko. */
function changeText(percent: number | null, better: boolean): { text: string; better: boolean } | null {
  if (percent === null || !Number.isFinite(percent)) return null;
  const sign = percent >= 0 ? "+" : "−";
  return { text: `${sign}${Math.abs(percent).toFixed(1)} % nei anksčiau`, better };
}

function ProfitabilityBars({ stats, periodLabel }: { stats: DashboardStats; periodLabel: string }) {
  const maximum = Math.max(stats.revenueCents, stats.totalCostCents, 1);
  const revenueWidth = `${Math.max((stats.revenueCents / maximum) * 100, stats.revenueCents ? 3 : 0)}%`;
  const costWidth = `${Math.max((stats.totalCostCents / maximum) * 100, stats.totalCostCents ? 3 : 0)}%`;

  return <div className="rounded-lg border border-line bg-surface p-5">
    <div className="flex items-baseline justify-between gap-4">
      <h3 className="font-semibold">Pajamos ir kaštai</h3>
      <p className="text-sm text-muted">{periodLabel}</p>
    </div>
    <div className="mt-5 space-y-4">
      <div><div className="mb-1.5 flex justify-between text-sm"><span className="text-muted">Pajamos</span><span className="font-medium tabular-nums">{formatCents(stats.revenueCents)}</span></div><div className="h-2 bg-raised"><div className="h-full bg-brand" style={{ width: revenueWidth }} /></div></div>
      <div><div className="mb-1.5 flex justify-between text-sm"><span className="text-muted">Kaštai</span><span className="font-medium tabular-nums">{formatCents(stats.totalCostCents)}</span></div><div className="h-2 bg-raised"><div className="h-full bg-ink/30" style={{ width: costWidth }} /></div></div>
    </div>
    <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-line pt-4">
      <div><dt className="text-xs font-medium text-muted">Marža</dt><dd className="mt-1 text-lg font-semibold">{formatPercent(stats.marginPercent)}</dd></div>
      <div><dt className="text-xs font-medium text-muted">Pajamos už km</dt><dd className="mt-1 text-lg font-semibold">{formatPerKm(stats.revenuePerKm)}</dd></div>
      {/* Fura uždirba paromis: lėtas krovinys už km atrodo gerai, bet užima furą ilgiau (#179). */}
      <div><dt className="text-xs font-medium text-muted">Pelnas per parą</dt><dd className="mt-1 text-lg font-semibold">{formatPerDay(stats.profitPerDayCents)}</dd></div>
    </dl>
  </div>;
}

function RecentTrips({ trips }: { trips: TripSummary[] }) {
  return <div className="rounded-lg border border-line bg-surface">
    <div className="flex items-center justify-between border-b border-line px-5 py-3"><h3 className="font-semibold">Paskutiniai reisai</h3><Link href="/trips" className="text-sm font-medium text-muted hover:text-ink">Visi reisai</Link></div>
    <div className="divide-y divide-line">
      {trips.slice(0, 5).map((trip) => <Link key={trip.id} href={`/trips/${trip.id}/edit`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3 hover:bg-page sm:grid-cols-[72px_minmax(0,1fr)_110px_110px]">
        <span className="hidden text-sm tabular-nums text-muted sm:block">{formatDate(trip.tripDate)}</span>
        <div className="min-w-0"><p className="truncate text-sm font-medium">{trip.origin} → {trip.destination}</p><p className="truncate text-xs text-muted"><span className="font-mono">{trip.truckPlate}</span> · {trip.tripNumber}</p></div>
        <span className="hidden text-right text-sm tabular-nums text-muted sm:block">{formatCents(trip.revenueCents)}</span>
        <span className={`text-right text-sm font-medium tabular-nums ${trip.profitCents >= 0 ? "text-good" : "text-bad"}`}>{formatCents(trip.profitCents)}</span>
      </Link>)}
    </div>
  </div>;
}

/**
 * Kur dingsta pinigai: kaštai pagal dedamąsias. Per parą – nes fura kainuoja
 * paromis, o dalis parodo, ką verta derinti pirmiausia.
 */
function CostStructure({ trips, periodLabel }: { trips: TripSummary[]; periodLabel: string }) {
  const rows = costStructure(trips);
  if (rows.length === 0) return null;
  const peak = Math.max(...rows.map((row) => row.sharePercent ?? 0), 1);

  return <div className="rounded-lg border border-line bg-surface">
    <div className="flex items-baseline justify-between gap-4 border-b border-line px-5 py-3"><h3 className="font-semibold">Kur dingsta pinigai</h3><p className="text-sm text-muted">{periodLabel}</p></div>
    <ul className="space-y-3 px-5 py-4">
      {rows.map((row) => <li key={row.key}>
        <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 truncate">{row.label}</span>
          <span className="whitespace-nowrap tabular-nums"><span className="text-muted">{formatCents(Math.round(row.cents))} · {formatPerDay(row.perDayCents)}/d. · </span><span className="font-medium">{formatPercent(row.sharePercent)}</span></span>
        </div>
        <div className="h-1.5 bg-raised"><div className="h-full bg-brand" style={{ width: `${((row.sharePercent ?? 0) / peak) * 100}%` }} /></div>
      </li>)}
    </ul>
  </div>;
}

function LossAlerts({ trips }: { trips: TripSummary[] }) {
  const losses = trips.filter((trip) => trip.profitCents < 0).sort((a, b) => a.profitCents - b.profitCents);
  return <div className="rounded-lg border border-line bg-surface">
    <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3"><h3 className="font-semibold">Nuostolingi reisai</h3><span className={`text-sm tabular-nums ${losses.length ? "font-medium text-bad" : "text-muted"}`}>{losses.length}</span></div>
    {losses.length ? <ul className="divide-y divide-line">{losses.slice(0, 6).map((trip) => <li key={trip.id}><Link href={`/trips/${trip.id}/edit`} className="flex items-start justify-between gap-3 px-5 py-3 hover:bg-page"><div className="min-w-0"><p className="truncate text-sm font-medium">{trip.origin} → {trip.destination}</p><p className="truncate text-xs text-muted">{trip.tripNumber} · {formatDate(trip.tripDate)}</p></div><span className="whitespace-nowrap text-sm font-medium tabular-nums text-bad">{formatCents(trip.profitCents)}</span></Link></li>)}</ul> : <p className="px-5 py-4 text-sm text-muted">Šiuo laikotarpiu nuostolingų reisų nėra.</p>}
  </div>;
}

type Period = PeriodKey | "custom";

const PERIOD_OPTIONS: { key: Period; label: string }[] = [...PERIODS, { key: "custom", label: "Nuo–iki" }];

const filterInput = "rounded-md border border-line-strong bg-surface px-2.5 py-1 text-sm";

interface Filters {
  period: Period;
  from: string;
  to: string;
  customerId: string;
  plate: string;
}

/**
 * Filtrai liečia visą suvestinę, kad skaičiai nesiskirtų tarp kortelių (#103):
 * laikotarpis (arba savos datos), užsakovas ir fura.
 */
function FilterBar({ value, onChange, customers, plates }: {
  value: Filters;
  onChange: (next: Filters) => void;
  customers: Customer[];
  plates: string[];
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  return <div className="flex flex-wrap items-center gap-2">
    <div role="group" aria-label="Laikotarpis" className="inline-flex max-w-full flex-wrap rounded-md border border-line-strong bg-surface p-0.5">
      {PERIOD_OPTIONS.map((period) => <button key={period.key} type="button" aria-pressed={period.key === value.period} onClick={() => set({ period: period.key })} className={`rounded-[3px] px-3 py-1 text-sm transition-colors ${period.key === value.period ? "bg-accent font-medium text-accent-ink" : "text-muted hover:text-ink"}`}>{period.label}</button>)}
    </div>
    {value.period === "custom" && <>
      <label className="text-sm text-muted">Nuo <input type="date" value={value.from} onChange={(event) => set({ from: event.target.value })} className={filterInput} /></label>
      <label className="text-sm text-muted">iki <input type="date" value={value.to} onChange={(event) => set({ to: event.target.value })} className={filterInput} /></label>
    </>}
    {customers.length > 0 && <select aria-label="Užsakovas" value={value.customerId} onChange={(event) => set({ customerId: event.target.value })} className={filterInput}>
      <option value="">Visi užsakovai</option>
      {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
    </select>}
    <select aria-label="Fura" value={value.plate} onChange={(event) => set({ plate: event.target.value })} className={filterInput}>
      <option value="">Visos furos</option>
      {plates.map((plate) => <option key={plate} value={plate}>{plate}</option>)}
    </select>
  </div>;
}

/**
 * Tuščia rida (#123).
 *
 * Tuščias kilometras degina kurą ir naudoja tą pačią parą, bet neuždirba nieko.
 * Blogiausia fura viršuje, nes būtent ją verta derinti pirmiausia.
 */
function EmptyKm({ trips, periodLabel }: { trips: TripSummary[]; periodLabel: string }) {
  const total = summarizeEmptyKm(trips);
  const byTruck = emptyKmByTruck(trips).filter((row) => row.emptyKm > 0);

  if (total.emptyKm === 0) return null;

  return <div className="rounded-lg border border-line bg-surface">
    <div className="flex items-baseline justify-between gap-4 border-b border-line px-5 py-3"><h3 className="font-semibold">Tuščia rida</h3><p className="text-sm text-muted">{periodLabel}</p></div>
    <dl className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-3">
      <div><dt className="text-xs font-medium text-muted">Tuščia</dt><dd className="mt-1 text-lg font-medium tabular-nums">{Math.round(total.emptyKm).toLocaleString("lt-LT")} km</dd></div>
      <div><dt className="text-xs font-medium text-muted">Visos ridos dalis</dt><dd className="mt-1 text-lg font-medium tabular-nums">{formatPercent(total.emptyShare)}</dd></div>
      <div><dt className="text-xs font-medium text-muted">Kuras tuščiai ridai</dt><dd className="mt-1 text-lg font-medium tabular-nums text-bad">{formatCents(total.emptyFuelCents)}</dd></div>
    </dl>
    {byTruck.length > 0 && <div className="overflow-x-auto border-t border-line">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-line text-left text-xs font-medium text-muted"><th className="px-5 py-3 font-medium">Fura</th><th className="px-3 py-3 text-right font-medium">Reisai</th><th className="px-3 py-3 text-right font-medium">Tuščia</th><th className="px-3 py-3 text-right font-medium">Dalis</th><th className="px-5 py-3 text-right font-medium">Kuras</th></tr></thead>
        <tbody className="divide-y divide-line">
          {byTruck.slice(0, 8).map((row) => <tr key={row.plate}>
            <td className="px-5 py-3 font-mono">{row.plate}</td>
            <td className="px-3 py-3 text-right tabular-nums text-muted">{row.tripCount}</td>
            <td className="px-3 py-3 text-right tabular-nums text-muted">{Math.round(row.emptyKm).toLocaleString("lt-LT")} km</td>
            <td className="px-3 py-3 text-right font-medium tabular-nums">{formatPercent(row.emptyShare)}</td>
            <td className="px-5 py-3 text-right tabular-nums text-muted">{formatCents(row.emptyFuelCents)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>}
    <p className="border-t border-line px-5 py-3 text-xs text-muted">Kaina – tik kuras tuščiai ridai. Paros kaštai ir keliai lieka reisui.</p>
  </div>;
}

/** Lentelės atsisiuntimas Excel'iui (#133). Rodomas tik ten, kur yra ką iškelti. */
function ExportButton({ onExport }: { onExport?: () => void }) {
  if (!onExport) return null;

  return <button type="button" onClick={onExport} className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-2.5 py-1 text-sm font-medium text-ink hover:bg-page">
    <Download aria-hidden className="size-3.5" strokeWidth={1.75} />
    CSV
  </button>;
}

/**
 * Mėnesių eiga (#131).
 *
 * Laikotarpio filtro **nepaiso** sąmoningai: tai kryptis, o ne pjūvis. Vienas
 * palyginimas su praėjusiu mėnesiu nerodo, ar marža krenta trečią mėnesį iš
 * eilės.
 */
function MonthlyTrend({ trips, today }: { trips: TripSummary[]; today: string }) {
  const months = monthlyStats(trips, today, 12);
  const peak = peakProfitCents(months);
  if (peak === 0) return null;

  return <div className="rounded-lg border border-line bg-surface">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3"><div><h3 className="font-semibold">Mėnesių eiga</h3><p className="text-sm text-muted">Paskutiniai 12 mėn.</p></div><ExportButton onExport={() => downloadCsv(reportFileName("menesiai", todayForFileName()), monthsToCsv(months))} /></div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-line text-left text-xs font-medium text-muted"><th className="px-5 py-3 font-medium">Mėnuo</th><th className="px-3 py-3 text-right font-medium">Reisai</th><th className="px-3 py-3 text-right font-medium">Pajamos</th><th className="px-3 py-3 text-right font-medium">Pelnas</th><th className="px-3 py-3 text-right font-medium">Marža</th><th className="px-5 py-3 font-medium">Eiga</th></tr></thead>
        <tbody className="divide-y divide-line">
          {months.map((month) => {
            const width = `${Math.round((Math.abs(month.profitCents) / peak) * 100)}%`;

            return <tr key={month.month} className={month.tripCount === 0 ? "text-muted" : ""}>
              <td className="px-5 py-3 tabular-nums">{month.month}</td>
              <td className="px-3 py-3 text-right tabular-nums text-muted">{month.tripCount}</td>
              <td className="px-3 py-3 text-right tabular-nums text-muted">{formatCents(month.revenueCents)}</td>
              <td className={`px-3 py-3 text-right font-medium tabular-nums ${month.tripCount === 0 ? "" : month.profitCents >= 0 ? "text-good" : "text-bad"}`}>{formatCents(month.profitCents)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-muted">{formatPercent(month.marginPercent)}</td>
              <td className="px-5 py-3">
                <div className="h-1.5 w-full min-w-24 bg-raised">
                  <div className={`h-full ${month.profitCents >= 0 ? "bg-good/70" : "bg-bad/70"}`} style={{ width }} />
                </div>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </div>;
}

/**
 * Kelių mokesčiai pagal šalį (#125).
 *
 * Atsako, per kurią šalį važiuojame daugiausia ir kiek ji kainuoja. Nuo to
 * priklauso, ar verta ieškoti aplinkkelio – PTV variantų palyginimas tokius
 * randa, bet tik žinant, kurio reikia ieškoti.
 */
function CountryRoads({ trips, periodLabel }: { trips: TripSummary[]; periodLabel: string }) {
  const rows = summarizeCountryRoads(trips).filter((row) => row.km > 0);
  if (rows.length === 0) return null;

  return <div className="rounded-lg border border-line bg-surface">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3"><div><h3 className="font-semibold">Keliai pagal šalį</h3><p className="text-sm text-muted">{periodLabel}</p></div><ExportButton onExport={() => downloadCsv(reportFileName("salys", todayForFileName()), countriesToCsv(rows))} /></div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-line text-left text-xs font-medium text-muted"><th className="px-5 py-3 font-medium">Šalis</th><th className="px-3 py-3 text-right font-medium">Reisai</th><th className="px-3 py-3 text-right font-medium">Km</th><th className="px-3 py-3 text-right font-medium">Keliai</th><th className="px-3 py-3 text-right font-medium">Dalis</th><th className="px-5 py-3 text-right font-medium">€/km</th></tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => <tr key={row.country}>
            <td className="px-5 py-3">{row.country}</td>
            <td className="px-3 py-3 text-right tabular-nums text-muted">{row.tripCount}</td>
            <td className="px-3 py-3 text-right tabular-nums text-muted">{Math.round(row.km).toLocaleString("lt-LT")}</td>
            <td className="px-3 py-3 text-right font-medium tabular-nums">{formatCents(row.costCents)}</td>
            <td className="px-3 py-3 text-right tabular-nums text-muted">{formatPercent(row.costShare)}</td>
            <td className="px-5 py-3 text-right tabular-nums text-muted">{row.centsPerKm === null ? "—" : `${(row.centsPerKm / 100).toFixed(2)} €/km`}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <p className="border-t border-line px-5 py-3 text-xs text-muted">Be tiltų, keltų, tunelių ir parkingo.</p>
  </div>;
}

interface ProfitRow extends Omit<ProfitGroup, "key"> {
  /** Ką rodo pirmas stulpelis: furos numeris arba kryptis. */
  label: string;
  mono?: boolean;
}

/**
 * Pelningumo pjūvis. Ta pati lentelė furoms ir kryptims (#101, #107):
 * skiriasi tik antraštė ir pirmas stulpelis.
 */
function ProfitTable({ title, subtitle, column, rows, note, action, onExport }: {
  title: string;
  subtitle: string;
  column: string;
  rows: ProfitRow[];
  note?: string;
  action?: { href: string; label: string };
  onExport?: () => void;
}) {
  return <div className="rounded-lg border border-line bg-surface">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3"><div><h3 className="font-semibold">{title}</h3><p className="text-sm text-muted">{subtitle}</p></div><div className="flex items-center gap-4">{action && <Link href={action.href} className="text-sm font-medium text-muted hover:text-ink">{action.label}</Link>}<ExportButton onExport={onExport} /></div></div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-line text-left text-xs font-medium text-muted"><th className="px-5 py-3 font-medium">{column}</th><th className="px-3 py-3 text-right font-medium">Reisai</th><th className="px-3 py-3 text-right font-medium">Pajamos</th><th className="px-3 py-3 text-right font-medium">Pelnas</th><th className="px-3 py-3 text-right font-medium">Marža</th><th className="px-3 py-3 text-right font-medium">Savikaina €/km</th><th className="px-3 py-3 text-right font-medium">Pelnas €/km</th><th className="px-5 py-3 text-right font-medium">Pelnas per parą</th></tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => <tr key={row.label}>
            <td className={`px-5 py-3 ${row.mono ? "font-mono" : ""}`}>{row.label}</td>
            <td className="px-3 py-3 text-right tabular-nums text-muted">{row.tripCount}</td>
            <td className="px-3 py-3 text-right tabular-nums text-muted">{formatCents(row.revenueCents)}</td>
            <td className={`px-3 py-3 text-right font-medium tabular-nums ${row.profitCents >= 0 ? "text-good" : "text-bad"}`}>{formatCents(row.profitCents)}</td>
            <td className="px-3 py-3 text-right tabular-nums text-muted">{formatPercent(row.marginPercent)}</td>
            <td className="px-3 py-3 text-right tabular-nums text-muted">{formatPerKm(row.costPerKm)}</td>
            <td className="px-3 py-3 text-right tabular-nums text-muted">{formatPerKm(row.profitPerKm)}</td>
            <td className="px-5 py-3 text-right tabular-nums text-muted">{formatPerDay(row.profitPerDayCents)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    {note && <p className="border-t border-line px-5 py-3 text-xs text-muted">{note}</p>}
  </div>;
}

/** Šiandiena už komponento ribų: render metu laiko imti negalima (React compiler). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function Dashboard() {
  const [allTrips, setAllTrips] = useState<TripSummary[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filters, setFilters] = useState<Filters>({ period: "all", from: "", to: "", customerId: "", plate: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadDashboard() {
      try {
        const [loadedTrips, loadedCustomers] = await Promise.all([
          listTrips(),
          // Užsakovų filtras – patogumas: be lentelės (0014) suvestinė veikia ir be jo.
          listCustomers(getSupabaseClient()).catch(() => ({ customers: [] as Customer[], available: false })),
        ]);
        if (cancelled) return;
        setAllTrips(loadedTrips);
        setCustomers(loadedCustomers.customers);
      } catch { if (!cancelled) setError("Nepavyko užkrauti suvestinės. Patikrinkite ryšį ir bandykite dar kartą."); }
      finally { if (!cancelled) setLoading(false); }
    }
    void loadDashboard();
    return () => { cancelled = true; };
  }, [attempt]);

  if (loading) return <div role="status" className="space-y-5"><div className="h-[30px] w-80 max-w-full animate-pulse rounded-md bg-raised" /><div className="h-[106px] animate-pulse rounded-lg border border-line bg-surface" /><div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]"><div className="h-72 animate-pulse rounded-lg border border-line bg-surface" /><div className="h-72 animate-pulse rounded-lg border border-line bg-surface" /></div><span className="sr-only">Kraunama suvestinė…</span></div>;

  if (error) return <div className="rounded-lg border border-bad/40 bg-bad-soft px-5 py-4"><p role="alert" className="text-sm text-bad">{error}</p><button type="button" className="mt-2 text-sm font-medium text-bad underline" onClick={() => { setLoading(true); setError(""); setAttempt((value) => value + 1); }}>Bandyti dar kartą</button></div>;

  if (!allTrips.length) return <div className="rounded-lg border border-line bg-surface px-6 py-12 text-center"><h3 className="font-semibold">Reisų dar nėra</h3><p className="mt-1 text-sm text-muted">Sukurkite pirmą reisą arba importuokite.</p><div className="mt-5 flex justify-center gap-3"><Link href="/trips/new" className="rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink">Naujas reisas</Link><Link href="/trips/import" className="rounded-md border border-line-strong px-3.5 py-2 text-sm font-medium hover:bg-page">Importas</Link></div></div>;

  const today = todayIso();
  const plates = [...new Set(allTrips.map((trip) => trip.truckPlate))].sort();
  const usedCustomers = customers.filter((customer) => allTrips.some((trip) => trip.customerId === customer.id));

  // Užsakovo ir furos filtrai taikomi prieš viską – ir palyginimui, ir mėnesių eigai.
  const scoped = allTrips.filter((trip) =>
    (!filters.customerId || trip.customerId === filters.customerId) && (!filters.plate || trip.truckPlate === filters.plate));
  const { realistic, unrealistic } = splitUnrealistic(scoped);

  const range: PeriodRange | null = filters.period === "custom"
    ? (filters.from && filters.to && filters.from <= filters.to ? { from: filters.from, to: filters.to } : null)
    : periodRange(filters.period, today);
  const trips = range ? filterByRange(realistic, range) : realistic;
  const excluded = range ? filterByRange(unrealistic, range) : unrealistic;
  const stats = calculateDashboardStats(trips);

  const filterBar = <FilterBar value={filters} onChange={setFilters} customers={usedCustomers} plates={plates} />;

  // Tuščias laikotarpis nėra klaida, todėl filtrai lieka matomi – kitaip
  // pasirinkus mėnesį be reisų nebūtų kaip grįžti atgal.
  if (!trips.length) return <div className="space-y-5">
    {filterBar}
    <p className="rounded-lg border border-line bg-surface px-6 py-12 text-center text-sm text-muted">
      {filters.period === "custom" && !range ? "Pasirinkite datas „nuo“ ir „iki“." : "Pagal šiuos filtrus reisų nėra."}
    </p>
  </div>;

  const periodLabel = filters.period === "custom" && range
    ? `${range.from} – ${range.to}`
    : PERIODS.find((item) => item.key === filters.period)?.label ?? "";
  const comparison = filters.period === "custom"
    ? (range ? compareWithRange(realistic, precedingRange(range), stats) : null)
    : comparePeriod(realistic, filters.period, today, stats);
  // Visiems laikams – nuo pirmo reiso iki šiandien.
  const span = range ?? { from: trips.reduce((min, trip) => (trip.tripDate < min ? trip.tripDate : min), today), to: today };
  const utilization = utilizationPercent(stats.days, filters.plate ? 1 : plates.length, span.from, span.to, today);
  const profitTone = stats.profitCents >= 0 ? "positive" : "negative";
  const perDayChange = (current: number | null, previous: number | null, higherIsBetter: boolean) => {
    if (current === null || previous === null || previous === 0) return null;
    const percent = ((current - previous) / Math.abs(previous)) * 100;
    return changeText(percent, higherIsBetter ? percent >= 0 : percent <= 0);
  };

  return <div className="space-y-5">
    {filterBar}

    {/* Fura kainuoja paromis – todėl paros rodikliai pirmi (#179). */}
    <section aria-label="Per parą">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Per parą · {periodLabel.toLowerCase()}</h2>
      <dl className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pelnas per parą" value={formatPerDay(stats.profitPerDayCents)} detail={`Marža ${formatPercent(stats.marginPercent)}`} tone={stats.profitPerDayCents !== null && stats.profitPerDayCents < 0 ? "negative" : "positive"} change={comparison && perDayChange(stats.profitPerDayCents, comparison.previous.profitPerDayCents, true)} />
        <StatCard label="Pajamos per parą" value={formatPerDay(stats.revenuePerDayCents)} detail="Visos pajamos / furų paros" change={comparison && perDayChange(stats.revenuePerDayCents, comparison.previous.revenuePerDayCents, true)} />
        <StatCard label="Kaštai per parą" value={formatPerDay(stats.costPerDayCents)} detail="Fura, kuras, keliai" change={comparison && perDayChange(stats.costPerDayCents, comparison.previous.costPerDayCents, false)} />
        <StatCard label="Pradirbtos paros" value={stats.days.toLocaleString("lt-LT", { maximumFractionDigits: 1 })} detail={utilization === null ? `${stats.tripCount} reisai` : `Užimtumas ${formatPercent(utilization)} · ${filters.plate ? "1 fura" : `${plates.length} furos`}`} />
      </dl>
    </section>

    <section aria-label="Iš viso ir per km">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Iš viso ir per km</h2>
      <dl className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pajamos" value={formatCents(stats.revenueCents)} detail={`${stats.tripCount} reisai · ${formatPerKm(stats.revenuePerKm)}`} change={comparison && changeText(comparison.revenue.percent, comparison.revenue.difference >= 0)} />
        {/* Savikaina už km yra tas skaičius, kuriuo deramasi (#127). */}
        <StatCard label="Kaštai" value={formatCents(stats.totalCostCents)} detail={`Savikaina ${formatPerKm(stats.costPerKm)}`} />
        <StatCard label="Pelnas" value={formatCents(stats.profitCents)} detail={`Marža ${formatPercent(stats.marginPercent)}`} tone={profitTone} change={comparison && changeText(comparison.profit.percent, comparison.profit.difference >= 0)} />
        <StatCard label="Tuščia rida" value={formatPercent(stats.emptySharePercent)} detail={`${Math.round(stats.emptyKm).toLocaleString("lt-LT")} km iš ${Math.round(stats.paidKm + stats.emptyKm).toLocaleString("lt-LT")}`} tone={stats.emptySharePercent !== null && stats.emptySharePercent > 20 ? "negative" : "neutral"} />
      </dl>
    </section>

    {comparison && <p className="text-xs text-muted">
      Lyginama su tokio pat ilgio ankstesniu laikotarpiu: tada {comparison.previous.tripCount} reis.,
      pelnas per parą {formatPerDay(comparison.previous.profitPerDayCents)}, marža {formatPercent(comparison.previous.marginPercent)}.
      {comparison.marginPoints !== null && ` Marža ${comparison.marginPoints >= 0 ? "pakilo" : "nukrito"} ${Math.abs(comparison.marginPoints).toFixed(1)} punkto.`}
    </p>}

    {excluded.length > 0 && <details className="rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
      <summary className="cursor-pointer">
        Neįskaičiuota: {excluded.length} su pajamomis iki {formatCents(MIN_REALISTIC_REVENUE_CENTS)} – tai ne pervežimai, o priemokos, paslaugos ar klaidos.
      </summary>
      <ul className="mt-2 space-y-1">{excluded.map((trip) => <li key={trip.id}>
        <Link href={`/trips/${trip.id}/edit`} className="underline">{trip.tripNumber}</Link> · {trip.tripDate} · {trip.origin} → {trip.destination} · {formatCents(trip.revenueCents)}
      </li>)}</ul>
    </details>}

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
      <div className="space-y-5"><ProfitabilityBars stats={stats} periodLabel={periodLabel} /><RecentTrips trips={trips} /></div>
      <div className="space-y-5"><CostStructure trips={trips} periodLabel={periodLabel} /><LossAlerts trips={trips} /></div>
    </div>
    <ProfitTable
      title="Furų pelningumas"
      subtitle={periodLabel}
      column="Fura"
      rows={summarizeByTruck(trips).map(({ plate, ...totals }) => ({ label: plate, mono: true, ...totals }))}
      action={{ href: "/trucks?skiltis=kastai", label: "Furų kaštai" }}
      onExport={() => downloadCsv(reportFileName("furos", todayForFileName()), trucksToCsv(summarizeByTruck(trips)))}
    />
    <MonthlyTrend trips={realistic} today={today} />
    <EmptyKm trips={trips} periodLabel={periodLabel} />
    <CountryRoads trips={trips} periodLabel={periodLabel} />
    <ProfitTable
      title="Krypčių pelningumas"
      subtitle={periodLabel}
      column="Kryptis"
      rows={summarizeByRoute(trips).map(({ origin, destination, ...totals }) => ({ label: `${origin} → ${destination}`, ...totals }))}
      onExport={() => downloadCsv(reportFileName("kryptys", todayForFileName()), routesToCsv(summarizeByRoute(trips)))}
    />
  </div>;
}
