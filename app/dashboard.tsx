"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { calculateDashboardStats, MIN_REALISTIC_REVENUE_CENTS, splitUnrealistic, utilizationPercent } from "../lib/dashboard";
import { listCustomers, summarizeByCustomer, type Customer } from "../lib/customers";
import { costStructure } from "../lib/cost-structure";
import { getSupabaseClient } from "../lib/supabase";
import { formatCents } from "../lib/money";
import { summarizeCountryRoads } from "../lib/country-roads";
import { periodValue, WEEKLY_METRICS, weeklyTotals, type WeeklyMetric, type WeekTotals } from "../lib/weekly";
import { addDays } from "../lib/trip-progress";
import { emptyKmByTruck, summarizeEmptyKm } from "../lib/empty-km";
import { monthlyStats, peakProfitCents } from "../lib/monthly";
import {
  countriesToCsv,
  monthsToCsv,
  reportFileName,
  customersToCsv,
  routesToCsv,
  trucksToCsv,
} from "../lib/report-export";
import { downloadCsv, todayForFileName } from "./download-csv";
import type { ProfitGroup } from "../lib/group-profit";
import { comparePeriod, compareWithRange } from "../lib/period-compare";
import { summarizeByRoute } from "../lib/route-profit";
import { filterByRange, periodRange, precedingRange, PERIODS, type PeriodKey, type PeriodRange } from "../lib/trip-period";
import { listTrips, type SkippedTrip, type TripSummary } from "../lib/trips";
import { SkippedTripsNotice } from "./ui";
import { summarizeByTruck } from "../lib/truck-profit";
import { plateKey } from "../lib/telematics-costs";
import { isCovered, planVsActual, tripSpan, type CostPair } from "../lib/plan-actual";
import { loadFuelReport, loadPlanActuals, type FuelReport, type PlanActualReport } from "./dashboard-fuel";

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

function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("lt-LT", { month: "short" }).format(new Date(`${month}-01T00:00:00`));
}

/**
 * Pajamos ir kaštai pagal mėnesį, šalia – tų pačių mėnesių pajamos pernai.
 * Kaip ir mėnesių lentelė, laikotarpio filtro nepaiso: tai kryptis, ne pjūvis.
 * Pernai stulpelis rodomas tik tada, kai pernai buvo reisų.
 */
function MonthlyChart({ trips, today }: { trips: TripSummary[]; today: string }) {
  const months = monthlyStats(trips, today, 12);
  const lastYear = monthlyStats(trips, `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`, 12);
  const withLastYear = lastYear.some((month) => month.tripCount > 0);
  const peak = Math.max(1, ...months.flatMap((month) => [month.revenueCents, month.totalCostCents]), ...(withLastYear ? lastYear.map((month) => month.revenueCents) : []));
  if (months.every((month) => month.tripCount === 0)) return null;
  const height = (cents: number) => `${(cents / peak) * 100}%`;

  return <div className="rounded-lg border border-line bg-surface p-5">
    <h3 className="font-semibold">Pajamos ir kaštai pagal mėnesį</h3>
    <ul className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted">
      <li className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-brand" />pajamos</li>
      <li className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-ink/35" />kaštai</li>
      {withLastYear && <li className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-ink/15" />pajamos pernai</li>}
    </ul>
    <div className="mt-4 flex h-48 items-end gap-2 border-b border-line">
      {months.map((month, index) => <div key={month.month} title={`${month.month}: pajamos ${formatCents(month.revenueCents)}, kaštai ${formatCents(month.totalCostCents)}${withLastYear ? `, pernai ${formatCents(lastYear[index].revenueCents)}` : ""}`} className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5 hover:bg-raised/60">
        <div className="w-full max-w-4 rounded-t bg-brand" style={{ height: height(month.revenueCents) }} />
        <div className="w-full max-w-4 rounded-t bg-ink/35" style={{ height: height(month.totalCostCents) }} />
        {withLastYear && <div className="w-full max-w-4 rounded-t bg-ink/15" style={{ height: height(lastYear[index].revenueCents) }} />}
      </div>)}
    </div>
    <div className="mt-1.5 flex gap-2 text-center text-xs text-muted">
      {months.map((month) => <span key={month.month} className="min-w-0 flex-1 truncate">{monthLabel(month.month)}</span>)}
    </div>
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

const TABS = [{ key: "profit", label: "Pelningumas" }, { key: "costs", label: "Kaštai" }, { key: "fuel", label: "Kuras" }, { key: "variance", label: "Planas ir faktas" }, { key: "weekly", label: "Savaitės" }] as const;
type Tab = (typeof TABS)[number]["key"];

function Tabs({ value, onChange }: { value: Tab; onChange: (tab: Tab) => void }) {
  return <div role="tablist" aria-label="Suvestinės skiltys" className="flex gap-1 overflow-x-auto border-b border-line">
    {TABS.map((tab) => <button key={tab.key} type="button" role="tab" aria-selected={tab.key === value} onClick={() => onChange(tab.key)} className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm transition-colors ${tab.key === value ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}>{tab.label}</button>)}
  </div>;
}

const WEEK_COUNT = 26;

function formatMetric(metric: WeeklyMetric, value: number | null): string {
  return value === null ? "—" : `${value.toLocaleString("lt-LT", { minimumFractionDigits: metric.digits, maximumFractionDigits: metric.digits })} ${metric.unit}`;
}

function WeeklyChart({ metric, weeks, lastYear }: { metric: WeeklyMetric; weeks: WeekTotals[]; lastYear: WeekTotals[] | null }) {
  const values = weeks.map(metric.value);
  const before = lastYear?.map(metric.value) ?? [];
  const peak = Math.max(...[...values, ...before].map((value) => Math.abs(value ?? 0)));
  const height = (value: number | null) => `${peak > 0 ? (Math.abs(value ?? 0) / peak) * 100 : 0}%`;
  const average = periodValue(metric, weeks);
  const latest = [...values].reverse().find((value) => value !== null) ?? null;
  // 2 % – kad kelių centų skirtumas neatrodytų kaip problema.
  const gap = latest !== null && average ? (latest - average) / Math.abs(average) : 0;
  const worse = metric.higherIsBetter ? gap < -0.02 : gap > 0.02;

  return <div className="rounded-lg border border-line bg-surface p-4">
    <h3 className="text-sm font-medium">{metric.label}</h3>
    <p className="mt-1 text-lg font-semibold tabular-nums">{formatMetric(metric, average)}</p>
    <p className={`text-xs ${worse ? "text-bad" : "text-muted"}`}>Paskutinė savaitė: {formatMetric(metric, latest)}</p>
    <div className="mt-3 flex h-24 items-end gap-px border-b border-line">
      {weeks.map((week, index) => <div key={week.week} title={`${week.week}: ${formatMetric(metric, values[index])}${lastYear ? `, pernai ${formatMetric(metric, before[index])}` : ""} · ${week.tripCount} reis.`} className="flex h-full min-w-0 flex-1 items-end justify-center gap-px hover:bg-raised/60">
        <div className={`w-full rounded-t-sm ${(values[index] ?? 0) < 0 ? "bg-bad/70" : "bg-brand"}`} style={{ height: height(values[index]) }} />
        {lastYear && <div className="w-full rounded-t-sm bg-ink/15" style={{ height: height(before[index]) }} />}
      </div>)}
    </div>
    <div className="mt-1 flex justify-between text-xs text-muted"><span>{weeks[0].week.slice(5)}</span><span>{weeks[weeks.length - 1].week.slice(5)}</span></div>
  </div>;
}

/**
 * Eiga pagal savaites. Kaip ir mėnesių grafikas, laikotarpio filtro nepaiso:
 * tai kryptis, ne pjūvis. Pernai rodoma tik tada, kai pernai buvo reisų.
 */
function WeeklyTab({ trips, today }: { trips: TripSummary[]; today: string }) {
  // Tik pilnos savaitės: einamoji ką tik prasidėjo, o keliai atsiranda vėliau.
  const lastFull = addDays(today, -7);
  const weeks = weeklyTotals(trips, lastFull, WEEK_COUNT);
  // 52 savaitės atgal, ne kalendorinė data: taip sutampa savaitės dienos.
  const before = weeklyTotals(trips, addDays(lastFull, -364), WEEK_COUNT);
  // Tuščios pradžios savaitės (duomenys dar neprasidėjo) tik suspaustų grafiką.
  const first = weeks.findIndex((week, index) => week.tripCount > 0 || before[index].tripCount > 0);
  const lastYear = before.some((week) => week.tripCount > 0) ? before.slice(first) : null;
  if (first < 0) return <p className="rounded-lg border border-line bg-surface px-5 py-4 text-sm text-muted">Per paskutines {WEEK_COUNT} savaites reisų nėra.</p>;

  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {WEEKLY_METRICS.map((metric) => <WeeklyChart key={metric.key} metric={metric} weeks={weeks.slice(first)} lastYear={lastYear} />)}
    </div>
    <p className="text-xs text-muted">
      Iki {WEEK_COUNT} paskutinių pilnų savaičių, nuo pirmadienio; reisas priskiriamas savaitei, kurią prasideda. Didelis skaičius – viso laikotarpio
      reikšmė, raudonai – kai paskutinė savaitė už ją blogesnė daugiau nei 2 %. Užvedus pelę – savaitės reikšmė ir reisų skaičius.{lastYear ? " Pilki stulpeliai – tos pačios savaitės pernai." : ""} Laikotarpio filtras čia netaikomas.
    </p>
  </div>;
}

/** Kaip /telematika: trumpa rida l/100 km paverčia vieno pylimo triukšmu. */
const MIN_KM_FOR_RATIO = 100;

/**
 * Kuras iš Telematikos suvestinės laikotarpiui. Kraunamas tik atidarius
 * skirtuką: Telematikos srautai lėti, o kitiems skirtukams jų nereikia.
 * Komponentas raktuojamas laikotarpiu, todėl pakeitus jį kraunama iš naujo.
 */
function FuelTab({ range, plate }: { range: PeriodRange; plate: string }) {
  const [report, setReport] = useState<FuelReport | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadFuelReport(range.from, range.to)
      .then((result) => { if (!cancelled) setReport(result); })
      .catch(() => { if (!cancelled) setReport({ ok: false, message: "Nepavyko gauti Telematikos duomenų. Bandykite vėliau." }); });
    return () => { cancelled = true; };
  }, [range.from, range.to]);

  if (!report) return <p role="status" className="rounded-lg border border-line bg-surface px-5 py-4 text-sm text-muted">Kraunami Telematikos duomenys…</p>;
  if (!report.ok) return <p role="alert" className="rounded-lg border border-bad/40 bg-bad-soft px-5 py-4 text-sm text-bad">{report.message}</p>;

  // Užsakovo filtras kurui netaikomas: Telematika kuro su užsakovu nesieja.
  const key = plate ? plateKey(plate) : "";
  const trucks = report.trucks
    .filter((row) => !key || plateKey(row.plate) === key)
    .sort((a, b) => (b.litresPer100Km ?? -1) - (a.litresPer100Km ?? -1));
  const insights = report.insights.filter((insight) => !key || insight.plate === null || plateKey(insight.plate) === key);
  const countries = report.byCountry.filter((row) => row.key !== "");

  if (!trucks.length) return <p className="rounded-lg border border-line bg-surface px-5 py-4 text-sm text-muted">Šiuo laikotarpiu Telematika kuro duomenų neturi. Ji laiko tik paskutinius ~3 mėnesius.</p>;

  return <div className="space-y-5">
    {insights.length > 0 && <div className="rounded-lg border border-line bg-surface">
      <h3 className="border-b border-line px-5 py-3 font-semibold">Kur galima sutaupyti</h3>
      <ul className="divide-y divide-line">{insights.map((insight) => <li key={`${insight.kind}-${insight.plate ?? ""}`} className="flex items-start justify-between gap-4 px-5 py-3">
        <div className="min-w-0"><p className="text-sm font-medium">{insight.title}</p><p className="text-xs text-muted">{insight.detail}</p></div>
        <span className="whitespace-nowrap text-sm font-medium tabular-nums text-bad">{formatCents(insight.cents)}</span>
      </li>)}</ul>
    </div>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs font-medium text-muted"><th className="px-5 py-3 font-medium">Fura</th><th className="px-3 py-3 text-right font-medium">Km</th><th className="px-3 py-3 text-right font-medium">l/100</th><th className="px-3 py-3 text-right font-medium">€/l</th><th className="px-3 py-3 text-right font-medium">Kuras</th><th className="px-5 py-3 text-right font-medium">AdBlue</th></tr></thead>
          <tbody className="divide-y divide-line">{trucks.map((row) => <tr key={row.plate}>
            <td className="px-5 py-3 font-mono">{row.plate}</td>
            <td className="px-3 py-3 text-right tabular-nums text-muted">{Math.round(row.km).toLocaleString("lt-LT")}</td>
            <td className="px-3 py-3 text-right font-medium tabular-nums">{row.litresPer100Km === null || row.km < MIN_KM_FOR_RATIO ? "—" : row.litresPer100Km.toFixed(1)}</td>
            <td className="px-3 py-3 text-right tabular-nums text-muted">{row.fuelPricePerL === null ? "—" : row.fuelPricePerL.toFixed(3)}</td>
            <td className="px-3 py-3 text-right tabular-nums text-muted">{formatCents(row.dieselCents)}</td>
            <td className="px-5 py-3 text-right tabular-nums text-muted">{formatCents(row.adblueCents)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {countries.length > 0 && <div className="rounded-lg border border-line bg-surface">
        <h3 className="border-b border-line px-5 py-3 font-semibold">Kuro kaina pagal šalį</h3>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs font-medium text-muted"><th className="px-5 py-3 font-medium">Šalis</th><th className="px-3 py-3 text-right font-medium">Litrai</th><th className="px-5 py-3 text-right font-medium">€/l</th></tr></thead>
          <tbody className="divide-y divide-line">{countries.map((row) => <tr key={row.key}>
            <td className="px-5 py-3">{row.key}</td>
            <td className="px-3 py-3 text-right tabular-nums text-muted">{Math.round(row.litres).toLocaleString("lt-LT")}</td>
            <td className="px-5 py-3 text-right font-medium tabular-nums">{row.pricePerL === null ? "—" : row.pricePerL.toFixed(3)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </div>
    <p className="text-xs text-muted">Faktas iš vilkikų skaitiklių ir pirkimų, visos įmonės – užsakovo filtras čia netaikomas. Telematika laiko tik ~3 paskutinius mėnesius. Daugiau – <Link href="/telematika" className="underline">Analizė</Link>.</p>
  </div>;
}

function PlanActualCell({ planned, actual }: { planned: number; actual: number }) {
  return <td className="px-3 py-3 text-right tabular-nums"><span className="text-muted">{formatCents(planned)} → </span>{formatCents(actual)}</td>;
}

const litres = (value: number | null) => value === null ? "—" : value.toFixed(1);

const costTotal = (pair: CostPair) => pair.fuelCents + pair.adblueCents + pair.roadCents;

/**
 * Planas ir faktas pagal furą: kiek kuras, AdBlue ir keliai turėjo kainuoti
 * pagal reisus ir kiek fura išleido tomis pačiomis dienomis. Furos paros
 * kaštai nelyginami – Telematika jų neturi.
 */
function PlanActualTab({ trips }: { trips: TripSummary[] }) {
  const [report, setReport] = useState<PlanActualReport | null>(null);
  // Eilutė, o ne masyvas: masyvas kiekvieną kartą naujas ir krautų be galo.
  const spansJson = JSON.stringify(trips.map(tripSpan));
  useEffect(() => {
    let cancelled = false;
    loadPlanActuals(JSON.parse(spansJson))
      .then((result) => { if (!cancelled) setReport(result); })
      .catch(() => { if (!cancelled) setReport({ ok: false, message: "Nepavyko gauti Telematikos duomenų. Bandykite vėliau." }); });
    return () => { cancelled = true; };
  }, [spansJson]);

  if (!report) return <p role="status" className="rounded-lg border border-line bg-surface px-5 py-4 text-sm text-muted">Kraunami Telematikos duomenys…</p>;
  if (!report.ok) return <p role="alert" className="rounded-lg border border-bad/40 bg-bad-soft px-5 py-4 text-sm text-bad">{report.message}</p>;

  const { coverage } = report;
  const covered = coverage ? trips.filter((trip) => isCovered(tripSpan(trip), coverage)) : [];
  const { rows, total, missing } = planVsActual(covered, report.actuals);
  const skipped = trips.length - covered.length;
  if (!coverage || !rows.length) return <p className="rounded-lg border border-line bg-surface px-5 py-4 text-sm text-muted">Šio laikotarpio reisų nėra su kuo palyginti: Telematika laiko tik ~3 paskutinius mėnesius, o vykstantys reisai lyginami grįžus.</p>;

  const planned = costTotal(total.planned);
  const worse = total.diffCents > 0;
  return <div className="space-y-3">
    <p className={`text-lg font-semibold ${worse ? "text-bad" : "text-good"}`}>
      Kuras, AdBlue ir keliai kainavo {formatCents(Math.abs(total.diffCents))} {worse ? "daugiau" : "mažiau"}, nei skaičiuota
      {planned > 0 && ` (${worse ? "+" : "−"}${formatPercent((Math.abs(total.diffCents) / planned) * 100)})`}.
    </p>
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-line text-left text-xs font-medium text-muted"><th className="px-5 py-3 font-medium">Fura</th><th className="px-3 py-3 text-right font-medium">Reisai</th><th className="px-3 py-3 text-right font-medium">Km planas → faktas</th><th className="px-3 py-3 text-right font-medium">Kuras</th><th className="px-3 py-3 text-right font-medium">AdBlue</th><th className="px-3 py-3 text-right font-medium">Keliai</th><th className="px-3 py-3 text-right font-medium">l/100 planas → faktas</th><th className="px-5 py-3 text-right font-medium">Skirtumas</th></tr></thead>
        <tbody className="divide-y divide-line">{[...rows, total].map((row) => <tr key={row.plate} className={row === total ? "font-medium" : ""}>
          <td className={`px-5 py-3 ${row === total ? "" : "font-mono"}`}>{row.plate}</td>
          <td className="px-3 py-3 text-right tabular-nums text-muted">{row.tripCount}</td>
          <td className="px-3 py-3 text-right tabular-nums"><span className="text-muted">{Math.round(row.plannedKm).toLocaleString("lt-LT")} → </span>{Math.round(row.actualKm).toLocaleString("lt-LT")}</td>
          <PlanActualCell planned={row.planned.fuelCents} actual={row.actual.fuelCents} />
          <PlanActualCell planned={row.planned.adblueCents} actual={row.actual.adblueCents} />
          <PlanActualCell planned={row.planned.roadCents} actual={row.actual.roadCents} />
          <td className="px-3 py-3 text-right tabular-nums"><span className="text-muted">{litres(row.plannedLitresPer100Km)} → </span>{litres(row.actualLitresPer100Km)}</td>
          <td className={`px-5 py-3 text-right font-medium tabular-nums ${row.diffCents > 0 ? "text-bad" : row.diffCents < 0 ? "text-good" : ""}`}>{row.diffCents > 0 ? "+" : ""}{formatCents(row.diffCents)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="space-y-1 text-xs text-muted">
      <p>Faktas skaičiuojamas tik reisų dienomis, kiekviena furos diena vieną kartą, stovėjimo dienos neįeina. Telematikos duomenys: {coverage.from} – {coverage.to}.</p>
      {skipped > 0 && <p>Nelyginta {skipped} reis.: ne visos jų dienos patenka į Telematikos duomenis (seni arba dar vyksta).</p>}
      {missing.length > 0 && <p>Be Telematikos duomenų: {missing.join(", ")}.</p>}
      <p>Importuoti reisai jau skaičiuoti su faktinėmis sąnaudomis ir keliais, todėl jų skirtumas mažas. Kelių mokestis kartais Telematikoje atsiranda vėliau.</p>
    </div>
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
 *
 * Importuoti reisai neįeina: jų keliai – tikros sąskaitos be šalių, o visi km
 * „Nemokami" atkarpoje, todėl lentelė rodytų nemokamus kelius ten, kur mokėta.
 * Su PTV užpildyti reisai taip pat – tada lentelėje nėra ką rodyti.
 */
function CountryRoads({ trips, periodLabel }: { trips: TripSummary[]; periodLabel: string }) {
  const planned = trips.filter((trip) => !trip.telematikaOrderId);
  const imported = trips.length - planned.length;
  const rows = summarizeCountryRoads(planned).filter((row) => row.km > 0);
  if (rows.length === 0 && imported === 0) return null;
  if (rows.every((row) => row.costCents === 0)) return <p className="rounded-lg border border-line bg-surface px-5 py-4 text-sm text-muted">
    Keliai pagal šalį nerodomi: importuotų ir su PTV užpildytų reisų keliai įrašyti viena tikra suma, be šalių.
  </p>;

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
    <p className="border-t border-line px-5 py-3 text-xs text-muted">
      Be tiltų, keltų, tunelių ir parkingo.
      {imported > 0 && ` Neįtraukta ${imported} importuot. reis.: jų keliai – tikros sąskaitos be šalių.`}
    </p>
  </div>;
}

interface ProfitRow extends Omit<ProfitGroup, "key"> {
  /** Ką rodo pirmas stulpelis: furos numeris, užsakovas arba kryptis. */
  label: string;
  mono?: boolean;
}

const DETAIL_GROUPS = [
  { key: "trucks", label: "Furos", column: "Fura" },
  { key: "customers", label: "Užsakovai", column: "Užsakovas" },
  { key: "routes", label: "Kryptys", column: "Kryptis" },
] as const;
type DetailGroup = (typeof DETAIL_GROUPS)[number]["key"];

/**
 * Pelnas per parą spalvinamas pagal visą parką: virš vidurkio žalia, nuostolis
 * raudona, tarp jų be spalvos – kitaip žalia būtų beveik viskas.
 */
function perDayTone(cents: number | null, fleetCents: number | null): string {
  if (cents === null) return "text-muted";
  if (cents < 0) return "bg-bad-soft text-bad";
  if (fleetCents !== null && cents > fleetCents) return "bg-good/10 text-good";
  return "";
}

/**
 * Viena detalių lentelė su pjūviu: furos, užsakovai arba kryptys (#101, #107).
 * Pakeitė atskiras furų ir krypčių lenteles – stulpeliai tie patys, keičiasi
 * tik grupavimas.
 */
function DetailsTable({ trips, customers, fleetPerDayCents, periodLabel }: {
  trips: TripSummary[];
  customers: Customer[];
  fleetPerDayCents: number | null;
  periodLabel: string;
}) {
  const [group, setGroup] = useState<DetailGroup>("trucks");
  // Be užsakovų pjūvis rodytų vieną eilutę „Be užsakovo“.
  const groups = DETAIL_GROUPS.filter((item) => item.key !== "customers" || customers.length > 0);
  const active = groups.find((item) => item.key === group) ?? groups[0];

  const rows: ProfitRow[] = active.key === "customers"
    ? summarizeByCustomer(trips, customers).map(({ name, ...totals }) => ({ label: name, ...totals }))
    : active.key === "routes"
      ? summarizeByRoute(trips).map(({ origin, destination, ...totals }) => ({ label: `${origin} → ${destination}`, ...totals }))
      : summarizeByTruck(trips).map(({ plate, ...totals }) => ({ label: plate, mono: true, ...totals }));
  const exportCsv = () => {
    const today = todayForFileName();
    if (active.key === "customers") downloadCsv(reportFileName("uzsakovai", today), customersToCsv(summarizeByCustomer(trips, customers)));
    else if (active.key === "routes") downloadCsv(reportFileName("kryptys", today), routesToCsv(summarizeByRoute(trips)));
    else downloadCsv(reportFileName("furos", today), trucksToCsv(summarizeByTruck(trips)));
  };

  return <div className="rounded-lg border border-line bg-surface">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
      <div><h3 className="font-semibold">Detalės</h3><p className="text-sm text-muted">{periodLabel}</p></div>
      <div className="flex flex-wrap items-center gap-3">
        {active.key === "trucks" && <Link href="/trucks?skiltis=kastai" className="text-sm font-medium text-muted hover:text-ink">Furų kaštai</Link>}
        <div role="group" aria-label="Pjūvis" className="inline-flex rounded-md border border-line-strong p-0.5">
          {groups.map((item) => <button key={item.key} type="button" aria-pressed={item.key === active.key} onClick={() => setGroup(item.key)} className={`rounded-[3px] px-3 py-1 text-sm transition-colors ${item.key === active.key ? "bg-accent font-medium text-accent-ink" : "text-muted hover:text-ink"}`}>{item.label}</button>)}
        </div>
        <ExportButton onExport={exportCsv} />
      </div>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-line text-left text-xs font-medium text-muted"><th className="px-5 py-3 font-medium">{active.column}</th><th className="px-3 py-3 text-right font-medium">Reisai</th><th className="px-3 py-3 text-right font-medium">Dienos</th><th className="px-3 py-3 text-right font-medium">Pelnas</th><th className="px-3 py-3 text-right font-medium">Pelnas/d.</th><th className="px-3 py-3 text-right font-medium">€/km</th><th className="px-3 py-3 text-right font-medium">Sav. €/km</th><th className="px-5 py-3 text-right font-medium" title="Pagal reisų kuro normas">l/100</th></tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => <tr key={row.label}>
            <td className={`px-5 py-3 ${row.mono ? "font-mono" : ""}`}>{row.label}</td>
            <td className="px-3 py-3 text-right tabular-nums text-muted">{row.tripCount}</td>
            <td className="px-3 py-3 text-right tabular-nums text-muted">{row.days.toLocaleString("lt-LT", { maximumFractionDigits: 1 })}</td>
            <td className={`px-3 py-3 text-right font-medium tabular-nums ${row.profitCents >= 0 ? "" : "text-bad"}`}>{formatCents(row.profitCents)}</td>
            <td className={`px-3 py-3 text-right font-medium tabular-nums ${perDayTone(row.profitPerDayCents, fleetPerDayCents)}`}>{formatPerDay(row.profitPerDayCents)}</td>
            <td className="px-3 py-3 text-right tabular-nums text-muted">{row.revenuePerKm === null ? "—" : row.revenuePerKm.toFixed(2)}</td>
            <td className="px-3 py-3 text-right tabular-nums text-muted">{row.costPerKm === null ? "—" : row.costPerKm.toFixed(2)}</td>
            <td className="px-5 py-3 text-right tabular-nums text-muted">{row.litresPer100Km === null ? "—" : row.litresPer100Km.toFixed(1)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <p className="border-t border-line px-5 py-3 text-xs text-muted">Pelnas per parą žalias – virš parko vidurkio ({formatPerDay(fleetPerDayCents)}), raudonas – nuostolis. l/100 – pagal reisų kuro normas; faktinės – skirtuke „Kuras“.</p>
  </div>;
}

/** Šiandiena už komponento ribų: render metu laiko imti negalima (React compiler). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function Dashboard() {
  const [allTrips, setAllTrips] = useState<TripSummary[]>([]);
  const [skipped, setSkipped] = useState<SkippedTrip[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filters, setFilters] = useState<Filters>({ period: "all", from: "", to: "", customerId: "", plate: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>("profit");

  useEffect(() => {
    let cancelled = false;
    async function loadDashboard() {
      try {
        const skippedTrips: SkippedTrip[] = [];
        const [loadedTrips, loadedCustomers] = await Promise.all([
          listTrips(skippedTrips),
          // Užsakovų filtras – patogumas: be lentelės (0014) suvestinė veikia ir be jo.
          listCustomers(getSupabaseClient()).catch(() => ({ customers: [] as Customer[], available: false })),
        ]);
        if (cancelled) return;
        setAllTrips(loadedTrips);
        setSkipped(skippedTrips);
        setCustomers(loadedCustomers.customers);
      } catch { if (!cancelled) setError("Nepavyko užkrauti suvestinės. Patikrinkite ryšį ir bandykite dar kartą."); }
      finally { if (!cancelled) setLoading(false); }
    }
    void loadDashboard();
    return () => { cancelled = true; };
  }, [attempt]);

  if (loading) return <div role="status" className="space-y-5"><div className="h-[30px] w-80 max-w-full animate-pulse rounded-md bg-raised" /><div className="h-[106px] animate-pulse rounded-lg border border-line bg-surface" /><div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]"><div className="h-72 animate-pulse rounded-lg border border-line bg-surface" /><div className="h-72 animate-pulse rounded-lg border border-line bg-surface" /></div><span className="sr-only">Kraunama suvestinė…</span></div>;

  if (error) return <div className="rounded-lg border border-bad/40 bg-bad-soft px-5 py-4"><p role="alert" className="text-sm text-bad">{error}</p><button type="button" className="mt-2 text-sm font-medium text-bad underline" onClick={() => { setLoading(true); setError(""); setAttempt((value) => value + 1); }}>Bandyti dar kartą</button></div>;

  if (!allTrips.length) return <div className="space-y-5"><SkippedTripsNotice skipped={skipped} /><div className="rounded-lg border border-line bg-surface px-6 py-12 text-center"><h3 className="font-semibold">Reisų dar nėra</h3><p className="mt-1 text-sm text-muted">Sukurkite pirmą reisą arba importuokite.</p><div className="mt-5 flex justify-center gap-3"><Link href="/trips/new" className="rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink">Naujas reisas</Link><Link href="/trips/import" className="rounded-md border border-line-strong px-3.5 py-2 text-sm font-medium hover:bg-page">Importas</Link></div></div></div>;

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
    <SkippedTripsNotice skipped={skipped} />
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

    <Tabs value={tab} onChange={setTab} />
    {tab === "profit" && <div role="tabpanel" aria-label="Pelningumas" className="space-y-5">
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
        <MonthlyChart trips={realistic} today={today} />
        <CostStructure trips={trips} periodLabel={periodLabel} />
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
        <RecentTrips trips={trips} />
        <LossAlerts trips={trips} />
      </div>
      <MonthlyTrend trips={realistic} today={today} />
    </div>}
    {tab === "costs" && <div role="tabpanel" aria-label="Kaštai" className="space-y-5">
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <CostStructure trips={trips} periodLabel={periodLabel} />
        <EmptyKm trips={trips} periodLabel={periodLabel} />
      </div>
      <CountryRoads trips={trips} periodLabel={periodLabel} />
    </div>}
    {tab === "fuel" && <div role="tabpanel" aria-label="Kuras">
      <FuelTab key={`${span.from}/${span.to}`} range={span} plate={filters.plate} />
    </div>}
    {tab === "variance" && <div role="tabpanel" aria-label="Planas ir faktas">
      <PlanActualTab trips={trips} />
    </div>}
    {tab === "weekly" && <div role="tabpanel" aria-label="Savaitės">
      <WeeklyTab trips={realistic} today={today} />
    </div>}
    <DetailsTable trips={trips} customers={usedCustomers} fleetPerDayCents={stats.profitPerDayCents} periodLabel={periodLabel} />
  </div>;
}
