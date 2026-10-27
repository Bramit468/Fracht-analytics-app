"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Download, Pencil, Search, Trash2 } from "lucide-react";
import { buttonSecondary, input, SkippedTripsNotice } from "../ui";
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
import { deleteTrip, listTrips, updateTripPayment, type SkippedTrip, type TripSummary } from "../../lib/trips";
import { fetchMinMarginPercent } from "../../lib/company-settings";
import { checkMargin, formatMinMargin } from "../../lib/margin-guard";
import { getSupabaseClient } from "../../lib/supabase";
import { listCustomers, type Customer } from "../../lib/customers";
import { todayInVilnius } from "../../lib/local-date";
import { paymentState, paymentStateText } from "../../lib/payments";

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
  const select = `${input} pr-8`;

  return <div className="flex flex-wrap items-center gap-2">
    <label className="relative min-w-56 flex-1 text-sm sm:max-w-sm">
      <span className="sr-only">Paieška</span>
      <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
      <input type="search" value={filter.query} onChange={(event) => onFilter({ ...filter, query: event.target.value })} placeholder="Reiso nr., miestas, fura" className={`${input} w-full pl-8`} />
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
    <span className="ml-auto text-sm tabular-nums text-muted">{shown === total ? `${total} reis.` : `${shown} iš ${total}`}</span>
    <button type="button" onClick={onExport} disabled={shown === 0} title="Atsisiųsti rodomus reisus Excel'iui" className={`${buttonSecondary} px-2.5 py-1.5`}>
      <Download aria-hidden className="size-3.5" strokeWidth={1.75} />
      CSV
    </button>
  </div>;
}

/**
 * Atsiunčia tai, kas matoma ekrane (#115).
 *
 * Iškeliamas ne visas sąrašas, o atrinktas: jei ieškojai vienos furos rugsėjį,
 * to ir reikia – kitaip failą tektų karpyti Excel'yje.
 */
function downloadTrips(trips: TripSummary[], today: string) {
  downloadCsv(csvFileName(today), tripsToCsv(trips));
}

export function TripList() {
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [skipped, setSkipped] = useState<SkippedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [removing, setRemoving] = useState("");
  const [filter, setFilter] = useState<TripFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<SortKey>("date");
  /** Įmonės minimali marža (#181). `null` – riba nenustatyta. */
  const [minMargin, setMinMargin] = useState<number | null>(null);
  /** Užsakovai – pavadinimui ir apmokėjimo terminui (#183, #185). */
  const [customers, setCustomers] = useState<Customer[]>([]);
  /** Kurio reiso apmokėjimo datos atskleistos. */
  const [openPayment, setOpenPayment] = useState("");

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
        const skippedTrips: SkippedTrip[] = [];
        const [loadedTrips, riba, uzsakovai] = await Promise.all([
          listTrips(skippedTrips),
          fetchMinMarginPercent(getSupabaseClient()),
          // Užsakovų klaida neturi paslėpti reisų sąrašo.
          listCustomers(getSupabaseClient()).catch(() => ({ customers: [], available: false })),
        ]);
        if (!cancelled) {
          setTrips(loadedTrips);
          setSkipped(skippedTrips);
          setMinMargin(riba);
          setCustomers(uzsakovai.customers);
        }
      } catch {
        if (!cancelled) setError("Nepavyko užkrauti reisų. Patikrinkite ryšį ir bandykite dar kartą.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadTrips();
    return () => { cancelled = true; };
  }, [attempt]);

  if (loading) return <p role="status" className="text-sm text-muted">Kraunami reisai…</p>;

  if (error) {
    return <div className="rounded-lg border border-bad/40 bg-bad-soft px-5 py-4 text-sm">
      <p role="alert" className="text-bad">{error}</p>
      <button type="button" className="mt-2 font-medium text-bad underline" onClick={() => {
        setLoading(true);
        setError("");
        setAttempt((value) => value + 1);
      }}>Bandyti dar kartą</button>
    </div>;
  }

  if (!trips.length) {
    return <div className="space-y-4">
      <SkippedTripsNotice skipped={skipped} />
      <p className="rounded-lg border border-line bg-surface px-6 py-10 text-center text-sm text-muted">
        Reisų dar nėra. Sukurkite pirmą – čia matysite jo pelną.
      </p>
    </div>;
  }

  const shown = sortTrips(
    filterTrips(trips, filter, new Date().toISOString().slice(0, 10)),
    sort,
  );
  const customersById = new Map(customers.map((customer) => [customer.id, customer]));
  const today = todayInVilnius();
  // Kol migracija 0015 nepaleista, datų stulpelių nėra – nerodomas ir stulpelis.
  const payments = trips.some((trip) => trip.invoicedOn !== undefined);

  return <div className="space-y-4">
    <SkippedTripsNotice skipped={skipped} />
    <Controls filter={filter} onFilter={setFilter} sort={sort} onSort={setSort} plates={tripPlates(trips)} shown={shown.length} total={trips.length} onExport={() => downloadTrips(shown, todayForFileName())} />

    {shown.length === 0 ? <p className="rounded-lg border border-line bg-surface px-6 py-10 text-center text-sm text-muted">
      Pagal šią paiešką reisų nėra.
    </p> : <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full min-w-[960px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-medium text-muted">
            <th className="py-2.5 pl-4 pr-3 font-medium">Data</th>
            <th className="px-3 py-2.5 font-medium">Maršrutas</th>
            <th className="px-3 py-2.5 font-medium">Fura</th>
            <th className="px-3 py-2.5 text-right font-medium">Pajamos</th>
            <th className="px-3 py-2.5 text-right font-medium">Kaštai</th>
            <th className="px-3 py-2.5 text-right font-medium">Pelnas</th>
            <th className="px-3 py-2.5 text-right font-medium">Marža</th>
            <th className="px-3 py-2.5 text-right font-medium">Per parą</th>
            {payments && <th className="px-3 py-2.5 font-medium">Apmokėjimas</th>}
            <th className="py-2.5 pl-3 pr-4"><span className="sr-only">Veiksmai</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {shown.map((trip) => {
            const below = minMargin !== null && checkMargin({
              marginPercent: trip.marginPercent,
              minMarginPercent: minMargin,
              totalCostCents: trip.totalCostCents,
              revenueCents: trip.revenueCents,
            }).status === "below";
            const customer = trip.customerId ? customersById.get(trip.customerId) : undefined;
            const termsDays = customer?.payment_terms_days ?? null;
            const open = openPayment === trip.id;

            return <Fragment key={trip.id}>
              <tr className="group hover:bg-page">
                <td className="whitespace-nowrap py-2.5 pl-4 pr-3 tabular-nums text-muted">{formatDate(trip.tripDate)}</td>
                <td className="max-w-80 px-3 py-2.5">
                  <Link href={`/trips/${trip.id}/edit`} className="block truncate font-medium hover:underline">{trip.origin} → {trip.destination}</Link>
                  <p className="truncate text-xs text-muted">{trip.tripNumber}{customer && ` · ${customer.name}`}</p>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[13px]">{trip.truckPlate}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-muted">{formatCents(trip.revenueCents)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-muted">{formatCents(trip.totalCostCents)}</td>
                <td className={`whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums ${trip.profitCents >= 0 ? "text-good" : "text-bad"}`}>{formatCents(trip.profitCents)}</td>
                <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${below ? "font-medium text-bad" : "text-muted"}`} title={below ? `Žemiau ribos ${formatMinMargin(minMargin)}` : undefined}>
                  {trip.marginPercent === null ? "—" : `${trip.marginPercent.toFixed(1)}%`}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-muted">{trip.profitPerDayCents === null ? "—" : formatCents(trip.profitPerDayCents)}</td>
                {payments && <td className="whitespace-nowrap px-3 py-2.5">
                  {/* Datos pildomos vėliau nei reisas, todėl čia, o ne reiso formoje (#185). */}
                  <button type="button" aria-expanded={open} onClick={() => setOpenPayment(open ? "" : trip.id)} className="text-left hover:underline">
                    <PaymentStatusText trip={trip} termsDays={termsDays} today={today} />
                  </button>
                </td>}
                <td className="whitespace-nowrap py-2.5 pl-3 pr-4">
                  <div className="flex justify-end gap-0.5 text-muted">
                    <Link href={`/trips/${trip.id}/edit`} title="Redaguoti" aria-label={`Redaguoti ${trip.tripNumber}`} className="grid size-7 place-items-center rounded-md hover:bg-raised hover:text-ink"><Pencil aria-hidden className="size-3.5" strokeWidth={1.75} /></Link>
                    {/* Tas pats maršrutas kartojasi kas savaitę (#129). */}
                    <Link href={`/trips/new?copy=${trip.id}`} title="Kopijuoti" aria-label={`Kopijuoti ${trip.tripNumber}`} className="grid size-7 place-items-center rounded-md hover:bg-raised hover:text-ink"><Copy aria-hidden className="size-3.5" strokeWidth={1.75} /></Link>
                    <button type="button" disabled={removing === trip.id} onClick={() => void remove(trip)} title="Ištrinti" aria-label={`Ištrinti ${trip.tripNumber}`} className="grid size-7 place-items-center rounded-md hover:bg-bad-soft hover:text-bad disabled:opacity-50"><Trash2 aria-hidden className="size-3.5" strokeWidth={1.75} /></button>
                  </div>
                </td>
              </tr>
              {payments && open && <tr className="bg-page">
                <td colSpan={10} className="px-4 pb-3">
                  <PaymentDates
                    trip={trip}
                    termsDays={termsDays}
                    today={today}
                    onSaved={(dates) => setTrips((current) => current.map((t) => (t.id === trip.id ? { ...t, ...dates } : t)))}
                  />
                </td>
              </tr>}
            </Fragment>;
          })}
        </tbody>
      </table>
    </div>}
  </div>;
}

/** Trumpa apmokėjimo būsena lentelės langelyje; spustelėjus atsiveria datos. */
function PaymentStatusText({ trip, termsDays, today }: { trip: TripSummary; termsDays: number | null; today: string }) {
  const state = paymentState({ invoicedOn: trip.invoicedOn ?? null, paidOn: trip.paidOn ?? null, termsDays }, today);
  const text = paymentStateText(state);
  if (!text) return <span className="text-muted">Įvesti datas</span>;
  const tone = state.status === "overdue" || state.status === "paid_late" ? "text-bad" : state.status === "paid" ? "text-good" : "text-ink";
  return <span className={tone}>{text}</span>;
}

/**
 * Sąskaitos ir apmokėjimo datos vienam reisui (#185). Įrašoma iškart pakeitus
 * datą – atskiro „išsaugoti“ mygtuko dešimčiai reisų niekas nespaudinėtų.
 */
function PaymentDates({ trip, termsDays, today, onSaved }: {
  trip: TripSummary;
  termsDays: number | null;
  today: string;
  onSaved: (dates: { invoicedOn?: string | null; paidOn?: string | null }) => void;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const state = paymentState({ invoicedOn: trip.invoicedOn ?? null, paidOn: trip.paidOn ?? null, termsDays }, today);
  const text = paymentStateText(state);

  async function save(field: "invoiced_on" | "paid_on", value: string) {
    const date = value === "" ? null : value;
    const stored = (field === "invoiced_on" ? trip.invoicedOn : trip.paidOn) ?? null;
    if (date === stored) return;
    setSaving(true);
    try {
      await updateTripPayment(trip.id, { [field]: date });
      setError("");
      onSaved(field === "invoiced_on" ? { invoicedOn: date } : { paidOn: date });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nepavyko išsaugoti datos.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="flex flex-wrap items-end gap-4 pt-1 text-sm">
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">Sąskaita išrašyta</span>
      <input type="date" disabled={saving} defaultValue={trip.invoicedOn ?? ""} onBlur={(event) => void save("invoiced_on", event.target.value)} className={`${input} py-1.5`} />
    </label>
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">Apmokėta</span>
      <input type="date" disabled={saving} defaultValue={trip.paidOn ?? ""} onBlur={(event) => void save("paid_on", event.target.value)} className={`${input} py-1.5`} />
    </label>
    {text && <span className={`pb-2 text-xs ${state.status === "overdue" || state.status === "paid_late" ? "text-bad" : state.status === "paid" ? "text-good" : "text-muted"}`}>
      {text}
    </span>}
    {state.status === "open" && trip.customerId && termsDays === null && <span className="pb-2 text-xs text-muted">
      Užsakovo terminas nežinomas – vėlavimas neskaičiuojamas.
    </span>}
    {error && <span role="alert" className="pb-2 text-xs text-bad">{error}</span>}
  </div>;
}
