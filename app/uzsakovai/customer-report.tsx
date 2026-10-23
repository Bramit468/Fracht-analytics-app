"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  listCustomers,
  NO_CUSTOMER_LABEL,
  parsePaymentTerms,
  paymentsByCustomer,
  summarizeByCustomer,
  updatePaymentTerms,
  type Customer,
} from "../../lib/customers";
import { todayInVilnius } from "../../lib/local-date";
import { formatCents } from "../../lib/money";
import { getSupabaseClient } from "../../lib/supabase";
import { listTrips, type TripSummary } from "../../lib/trips";

function percent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

/**
 * Pelningumas ir apmokėjimai pagal užsakovą (#183, #185).
 *
 * Skaičiuojama nuo bendrų sumų, kaip ir suvestinėje, todėl stulpelių sumos
 * sutampa su ja. Šalia pelno – kaip greitai jis virsta pinigais: pelningas
 * klientas, mokantis po 90 dienų, reisus finansuoja iš jūsų kišenės.
 */
export function CustomerReport() {
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [loadedTrips, { customers: loaded, available: ready }] = await Promise.all([
          listTrips(),
          listCustomers(getSupabaseClient()),
        ]);
        if (cancelled) return;
        setAvailable(ready);
        setTrips(loadedTrips);
        setCustomers(loaded);
      } catch {
        if (!cancelled) setError("Nepavyko užkrauti užsakovų. Patikrinkite ryšį ir bandykite dar kartą.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <p role="status">Kraunami užsakovai…</p>;
  if (error) return <p role="alert" className="text-bad">{error}</p>;
  if (!available) {
    return <p className="rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
      Užsakovų dar nėra duomenų bazėje – Supabase paleiskite migraciją 0014. Tada reiso formoje
      atsiras laukas „Užsakovas“.
    </p>;
  }

  const rows = summarizeByCustomer(trips, customers);
  if (!rows.some((row) => row.customerId !== null)) {
    return <p className="rounded-lg border border-line bg-surface px-6 py-10 text-center text-sm text-muted">
      Užsakovų dar nepriskirta. Atidarykite reisą ir lauke „Užsakovas“ pasirinkite arba įrašykite
      klientą. <Link href="/trips" className="font-semibold text-good underline">Reisai</Link>
    </p>;
  }

  // Termino stulpelis atsiranda tik su migracija 0015.
  const paymentsReady = customers.some((customer) => "payment_terms_days" in customer);
  const payments = paymentsByCustomer(trips, customers, todayInVilnius());
  const terms = new Map(customers.map((customer) => [customer.id, customer.payment_terms_days ?? null]));

  return <div className="space-y-4">
    <div className="rounded-lg border border-line bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-medium text-muted">
              <th className="px-5 py-3 font-medium">Užsakovas</th>
              <th className="px-3 py-3 text-right font-medium">Reisai</th>
              <th className="px-3 py-3 text-right font-medium">Pajamos</th>
              <th className="px-3 py-3 text-right font-medium">Pelnas</th>
              <th className="px-3 py-3 text-right font-medium">Marža</th>
              <th className="px-3 py-3 text-right font-medium">Pelnas €/km</th>
              <th className="px-3 py-3 text-right font-medium">Per parą</th>
              {paymentsReady && <>
                <th className="px-3 py-3 text-right font-medium">Terminas, d.</th>
                <th className="px-3 py-3 text-right font-medium">Neapmokėta</th>
                <th className="px-3 py-3 text-right font-medium">Pradelsta</th>
                <th className="px-5 py-3 text-right font-medium">Moka per, d.</th>
              </>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => {
              const pay = row.customerId === null ? undefined : payments.get(row.customerId);
              return <tr key={row.customerId ?? ""} className={row.customerId === null ? "text-muted" : undefined}>
                <td className="px-5 py-3">{row.name}</td>
                <td className="px-3 py-3 text-right tabular-nums">{row.tripCount}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatCents(row.revenueCents)}</td>
                <td className={`px-3 py-3 text-right font-semibold tabular-nums ${row.profitCents >= 0 ? "text-good" : "text-bad"}`}>{formatCents(row.profitCents)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{percent(row.marginPercent)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{row.profitPerKm === null ? "—" : `${row.profitPerKm.toFixed(2)} €/km`}</td>
                <td className="px-3 py-3 text-right tabular-nums">{row.profitPerDayCents === null ? "—" : formatCents(row.profitPerDayCents)}</td>
                {paymentsReady && (row.customerId === null ? <td colSpan={4} /> : <>
                  <td className="px-3 py-3 text-right">
                    <TermsInput
                      customerId={row.customerId}
                      name={row.name}
                      value={terms.get(row.customerId) ?? null}
                      onSaved={(days) => setCustomers((current) => current.map((customer) =>
                        customer.id === row.customerId ? { ...customer, payment_terms_days: days } : customer))}
                    />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{pay && pay.openCents > 0 ? formatCents(pay.openCents) : "—"}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${pay && pay.overdueCents > 0 ? "font-semibold text-bad" : ""}`}>
                    {pay && pay.overdueCents > 0 ? `${formatCents(pay.overdueCents)} (${pay.overdueCount})` : "—"}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{pay?.avgDaysToPay == null ? "—" : Math.round(pay.avgDaysToPay)}</td>
                </>)}
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-5 py-3 text-xs text-muted">
        Sumos – nuo visų reisų kartu, ne reisų vidurkis. „{NO_CUSTOMER_LABEL}“ – reisai, kuriems
        užsakovas dar nepriskirtas; jie rodomi, kad sumos sutaptų su suvestine.
        {paymentsReady && <> Neapmokėta – sąskaitos išrašytos, bet nesumokėtos (pajamos be PVM).
        Pradelsta skaičiuojama tik žinant terminą. „Moka per“ – vidutiniškai dienų nuo sąskaitos
        iki apmokėjimo, didesnės sąskaitos sveria daugiau. Datas įrašykite reisų sąraše.</>}
      </p>
    </div>
    {!paymentsReady && <p className="text-sm text-muted">
      Apmokėjimų terminams ir vėlavimams Supabase paleiskite migraciją 0015.
    </p>}
  </div>;
}

function TermsInput({ customerId, name, value, onSaved }: {
  customerId: string;
  name: string;
  value: number | null;
  onSaved: (days: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const parsed = parsePaymentTerms(text);
    if (!parsed.ok) { setError(parsed.error); return; }
    if (parsed.value === value) { setError(""); return; }
    setSaving(true);
    try {
      await updatePaymentTerms(getSupabaseClient(), customerId, parsed.value);
      setError("");
      onSaved(parsed.value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nepavyko išsaugoti termino.");
    } finally {
      setSaving(false);
    }
  }

  return <span className="inline-flex flex-col items-end gap-1">
    <input
      type="text"
      inputMode="numeric"
      value={text}
      disabled={saving}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => void save()}
      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
      aria-label={`${name}: apmokėjimo terminas dienomis`}
      aria-invalid={error ? true : undefined}
      placeholder="—"
      className="w-16 rounded-md border border-line bg-transparent px-2 py-1 text-right tabular-nums aria-invalid:border-bad"
    />
    {error && <span role="alert" className="max-w-40 text-xs text-bad">{error}</span>}
  </span>;
}
