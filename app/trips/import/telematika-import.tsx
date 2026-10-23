"use client";

import { useState } from "react";

import { ensureCustomer, listCustomers, type Customer } from "../../../lib/customers";
import { formatCents } from "../../../lib/money";
import { getSupabaseClient } from "../../../lib/supabase";
import { saveTrip } from "../../../lib/trips";
import { buttonPrimary, buttonSecondary } from "../../ui";
import { previewTelematikaOrders, type OrderImportResult } from "./telematika-orders";

const km = (value: number) => Math.round(value).toLocaleString("lt-LT");

/**
 * Užsakymai iš Telematikos: peržiūra, tada importas.
 *
 * Pakartotinai importuojant tas pats užsakymas atnaujinamas, o ne dubliuojamas
 * (`telematika_order_id`). Tiekėjas duoda tik paskutinį mėnesį, todėl importuoti
 * verta bent kas kelias savaites.
 */
export function TelematikaImport() {
  const [result, setResult] = useState<OrderImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [failures, setFailures] = useState<string[]>([]);

  async function load() {
    setLoading(true);
    setProgress("");
    setFailures([]);
    try {
      setResult(await previewTelematikaOrders());
    } catch {
      setResult({ ok: false, message: "Nepavyko gauti užsakymų. Bandykite dar kartą." });
    } finally {
      setLoading(false);
    }
  }

  async function importAll() {
    if (!result?.ok) return;
    setSaving(true);
    const errors: string[] = [];
    let saved = 0;
    try {
      const client = getSupabaseClient();
      const { customers: loaded, available } = await listCustomers(client);
      const customers: Customer[] = [...loaded];
      for (const [index, item] of result.trips.entries()) {
        setProgress(`Importuojama ${index + 1} iš ${result.trips.length}…`);
        try {
          let customerId: string | null = null;
          if (available && item.customer) {
            const customer = await ensureCustomer(client, customers, item.customer);
            if (!customers.some((known) => known.id === customer.id)) customers.push(customer);
            customerId = customer.id;
          }
          await saveTrip({ ...item.trip, id: item.existingId ?? undefined, ...(available ? { customer_id: customerId } : {}) }, item.legs);
          saved += 1;
        } catch {
          errors.push(`${item.trip.trip_number} (${item.trip.trip_date})`);
        }
      }
      setProgress(`Importuota ${saved} iš ${result.trips.length}.`);
      setFailures(errors);
    } catch {
      setProgress("Nepavyko pradėti importo. Patikrinkite ryšį.");
    } finally {
      setSaving(false);
    }
  }

  const reasons = result?.ok
    ? Object.entries(result.skipped.reduce<Record<string, number>>((counts, item) => {
      const reason = item.reason.startsWith("Furos ") ? "Furos nėra sąraše." : item.reason;
      counts[reason] = (counts[reason] ?? 0) + 1;
      return counts;
    }, {}))
    : [];

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void load()} disabled={loading || saving} className={result?.ok ? buttonSecondary : buttonPrimary}>
        {loading ? "Gaunama…" : result?.ok ? "Atnaujinti" : "Gauti užsakymus iš Telematikos"}
      </button>
      {result?.ok && result.trips.length > 0 && <button type="button" onClick={() => void importAll()} disabled={saving} className={buttonPrimary}>
        {saving ? "Importuojama…" : `Importuoti ${result.trips.length}`}
      </button>}
      {progress && <p role="status" className="text-sm">{progress}</p>}
    </div>

    {failures.length > 0 && <p role="alert" className="rounded-lg border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">
      Neįrašyti: {failures.join(", ")}. Dažniausia priežastis – nepaleista migracija 0019 arba trūksta „Nemokami“ įkainio.
    </p>}

    {result && !result.ok && <p role="alert" className="text-sm text-bad">{result.message}</p>}

    {result?.ok && <>
      <p className="text-sm text-muted">
        {result.trips.filter((item) => !item.existingId).length} nauji, {result.trips.filter((item) => item.existingId).length} bus atnaujinti
        {reasons.length > 0 && <>, praleista {result.skipped.length}: {reasons.map(([reason, count]) => `${reason.replace(/\.$/, "").toLowerCase()} – ${count}`).join("; ")}</>}.
        {result.unassignedTollCents > 0 && <> Kelių mokesčių dienomis be užsakymų: {formatCents(result.unassignedTollCents)} – jie reisams nepriskirti.</>}
      </p>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-muted">
            <th className="px-3 py-2.5 font-medium">Data</th>
            <th className="px-3 py-2.5 font-medium">Užsakymas</th>
            <th className="px-3 py-2.5 font-medium">Maršrutas</th>
            <th className="px-3 py-2.5 font-medium">Fura</th>
            <th className="px-3 py-2.5 text-right font-medium">Paros</th>
            <th className="px-3 py-2.5 text-right font-medium">Km apm. / tušti</th>
            <th className="px-3 py-2.5 text-right font-medium">Kaina</th>
            <th className="px-3 py-2.5 text-right font-medium">Pelnas</th>
          </tr></thead>
          <tbody>{result.trips.map((item) => <tr key={item.orderId} className="border-b border-line align-top last:border-b-0">
            <td className="whitespace-nowrap px-3 py-2 tabular-nums">{item.trip.trip_date}</td>
            <td className="px-3 py-2">
              {item.trip.trip_number}
              {item.existingId && <span className="ml-1 text-xs text-muted">(atnaujinti)</span>}
              {item.customer && <span className="block text-xs text-muted">{item.customer}</span>}
              {item.notes.map((note) => <span key={note} className="block text-xs text-warn">{note}</span>)}
            </td>
            <td className="px-3 py-2">{item.trip.origin} → {item.trip.destination}</td>
            <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{item.plate}</td>
            <td className="px-3 py-2 text-right tabular-nums">{item.trip.days.toFixed(2).replace(".", ",")}</td>
            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{km(item.trip.paid_km)} / {km(item.trip.empty_km)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatCents(item.trip.freight_price_cents ?? 0)}</td>
            <td className={`px-3 py-2 text-right tabular-nums ${item.profitCents < 0 ? "text-bad" : ""}`}>
              {formatCents(item.profitCents)}
              {item.marginPercent !== null && <span className="block text-xs text-muted">{item.marginPercent.toFixed(1)} %</span>}
            </td>
          </tr>)}</tbody>
        </table>
      </div>

      {result.skipped.length > 0 && <details className="text-sm">
        <summary className="cursor-pointer text-muted">Praleisti užsakymai ({result.skipped.length})</summary>
        <ul className="mt-2 space-y-1">{result.skipped.map((item) => <li key={item.orderId}>
          {item.orderNo || `TLM ${item.orderId}`} – {item.reason}
        </li>)}</ul>
      </details>}
    </>}
  </div>;
}
