"use client";

import { useEffect, useState } from "react";

import { FERRY_ROUTES, listFerryRates, parseFerryRate, type FerryRate } from "../../lib/ferry-rates";
import { formatCents } from "../../lib/money";
import { getSupabaseClient } from "../../lib/supabase";

const input = "rounded-md border border-line bg-transparent px-2.5 py-1.5 text-sm";

/**
 * Sutartinės keltų kainos (0027). Rašo per naršyklės klientą: ar leidžiama,
 * sprendžia RLS (tik savininkas), o čia tik paaiškinama, kodėl neįrašyta.
 */
export function FerryRatesEditor() {
  const [rates, setRates] = useState<FerryRate[]>([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listFerryRates(getSupabaseClient())
      .then((result) => { if (!cancelled) { setRates(result.rates); setAvailable(result.available); } })
      .catch(() => { if (!cancelled) setError("Nepavyko užkrauti keltų kainų."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function add() {
    const parsed = parseFerryRate(label, price, note);
    if (!parsed.ok) { setError(parsed.error); return; }
    setBusy(true);
    setError("");
    try {
      const existing = rates.find((rate) => rate.label.toLowerCase() === parsed.value.label.toLowerCase());
      const client = getSupabaseClient();
      // Tas pats maršrutas – kaina atnaujinama, ne dubliuojama.
      const { data, error: saveError } = existing
        ? await client.from("ferry_rates").update({ ...parsed.value, updated_at: new Date().toISOString() }).eq("id", existing.id).select("id,label,price_cents,note,updated_at")
        : await client.from("ferry_rates").insert(parsed.value).select("id,label,price_cents,note,updated_at");
      if (saveError || !data?.length) {
        setError(saveError?.code === "42501" || !data?.length ? "Keisti gali tik įmonės savininkas." : "Nepavyko išsaugoti. Bandykite dar kartą.");
        return;
      }
      const saved = data[0] as FerryRate;
      setRates((current) => [...current.filter((rate) => rate.id !== saved.id), saved].sort((a, b) => a.label.localeCompare(b.label, "lt")));
      setLabel("");
      setPrice("");
      setNote("");
    } finally {
      setBusy(false);
    }
  }

  async function remove(rate: FerryRate) {
    setBusy(true);
    setError("");
    try {
      const { data, error: deleteError } = await getSupabaseClient().from("ferry_rates").delete().eq("id", rate.id).select("id");
      if (deleteError || !data?.length) { setError("Ištrinti gali tik įmonės savininkas."); return; }
      setRates((current) => current.filter((row) => row.id !== rate.id));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p role="status" className="text-sm text-muted">Kraunama…</p>;
  if (!available) return <p className="text-sm text-warn">Keltų kainų duomenų bazėje dar nėra – reikia migracijos 0027.</p>;

  return <div className="space-y-3">
    {rates.length > 0 && <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-sm">
      {rates.map((rate) => <li key={rate.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <span>
          <span className="font-medium">{rate.label}</span> <span className="tabular-nums">{formatCents(rate.price_cents)}</span>
          {rate.note && <span className="ml-2 text-xs text-muted">{rate.note}</span>}
          <span className="ml-2 text-xs text-muted">atnaujinta {rate.updated_at.slice(0, 10)}</span>
        </span>
        <button type="button" disabled={busy} onClick={() => void remove(rate)} className="text-sm text-bad underline disabled:opacity-50">Ištrinti</button>
      </li>)}
    </ul>}
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">Maršrutas
        <input list="keltu-marsrutai" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Klaipėda – Karlshamn" className={`${input} w-56`} />
        <datalist id="keltu-marsrutai">{FERRY_ROUTES.map((route) => <option key={route.label} value={route.label}>{route.operator}</option>)}</datalist>
      </label>
      <label className="flex flex-col gap-1 text-sm">Kaina vienam plaukimui, €
        <input type="text" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="pvz. 520" className={`${input} w-32`} />
      </label>
      <label className="flex flex-col gap-1 text-sm">Pastaba
        <input type="text" maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} placeholder="pvz. DFDS sutartis 2026" className={`${input} w-56`} />
      </label>
      <button type="button" disabled={busy} onClick={() => void add()} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink disabled:opacity-50">Išsaugoti</button>
    </div>
    {error && <p role="alert" className="text-sm text-bad">{error}</p>}
  </div>;
}
