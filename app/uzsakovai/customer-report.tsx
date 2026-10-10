"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { listCustomers, NO_CUSTOMER_LABEL, summarizeByCustomer, type CustomerProfit } from "../../lib/customers";
import { formatCents } from "../../lib/money";
import { getSupabaseClient } from "../../lib/supabase";
import { listTrips } from "../../lib/trips";

function percent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

/**
 * Pelningumas pagal užsakovą (#183).
 *
 * Skaičiuojama nuo bendrų sumų, kaip ir suvestinėje, todėl stulpelių sumos
 * sutampa su ja. Pelnas per parą šalia, nes klientas su gera €/km, bet ilgomis
 * prastovomis furą užima brangiau, nei atrodo.
 */
export function CustomerReport() {
  const [rows, setRows] = useState<CustomerProfit[]>([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [trips, { customers, available: ready }] = await Promise.all([
          listTrips(),
          listCustomers(getSupabaseClient()),
        ]);
        if (cancelled) return;
        setAvailable(ready);
        setRows(summarizeByCustomer(trips, customers));
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
    return <p className="rounded-2xl border border-warn bg-warn-soft p-5 text-sm text-warn">
      Užsakovų dar nėra duomenų bazėje – Supabase paleiskite migraciją 0014. Tada reiso formoje
      atsiras laukas „Užsakovas“.
    </p>;
  }

  const assigned = rows.filter((row) => row.customerId !== null);
  if (assigned.length === 0) {
    return <p className="rounded-2xl border border-dashed bg-surface p-8 text-center text-muted">
      Užsakovų dar nepriskirta. Atidarykite reisą ir lauke „Užsakovas“ pasirinkite arba įrašykite
      klientą. <Link href="/trips" className="font-semibold text-good underline">Reisai</Link>
    </p>;
  }

  return <div className="rounded-2xl border border-line bg-surface shadow-sm">
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-5 py-3 font-medium">Užsakovas</th>
            <th className="px-3 py-3 text-right font-medium">Reisai</th>
            <th className="px-3 py-3 text-right font-medium">Pajamos</th>
            <th className="px-3 py-3 text-right font-medium">Pelnas</th>
            <th className="px-3 py-3 text-right font-medium">Marža</th>
            <th className="px-3 py-3 text-right font-medium">Pelnas €/km</th>
            <th className="px-5 py-3 text-right font-medium">Pelnas per parą</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => <tr key={row.customerId ?? ""} className={row.customerId === null ? "text-muted" : undefined}>
            <td className="px-5 py-3">{row.name}</td>
            <td className="px-3 py-3 text-right tabular-nums">{row.tripCount}</td>
            <td className="px-3 py-3 text-right tabular-nums">{formatCents(row.revenueCents)}</td>
            <td className={`px-3 py-3 text-right font-semibold tabular-nums ${row.profitCents >= 0 ? "text-good" : "text-bad"}`}>{formatCents(row.profitCents)}</td>
            <td className="px-3 py-3 text-right tabular-nums">{percent(row.marginPercent)}</td>
            <td className="px-3 py-3 text-right tabular-nums">{row.profitPerKm === null ? "—" : `${row.profitPerKm.toFixed(2)} €/km`}</td>
            <td className="px-5 py-3 text-right tabular-nums">{row.profitPerDayCents === null ? "—" : formatCents(row.profitPerDayCents)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <p className="border-t border-line px-5 py-3 text-xs text-muted">
      Sumos – nuo visų reisų kartu, ne reisų vidurkis. „{NO_CUSTOMER_LABEL}“ – reisai, kuriems
      užsakovas dar nepriskirtas; jie rodomi, kad sumos sutaptų su suvestine.
    </p>
  </div>;
}
