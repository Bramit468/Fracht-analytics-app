"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { todayInVilnius } from "../../lib/local-date";
import { centsToInput, formatCents, parseEuroToCents } from "../../lib/money";
import {
  DECISION_LABELS,
  filterQuotes,
  listQuotes,
  OUTCOME_LABELS,
  QUOTE_REASONS,
  quoteStats,
  SOURCE_LABELS,
  updateQuote,
  VERDICT_LABELS,
  type QuoteDecision,
  type QuoteFilters,
  type QuoteOutcome,
  type QuoteRow,
} from "../../lib/quotes";
import { getSupabaseClient } from "../../lib/supabase";

/** Įrašymo laikas Vilniaus laiku: „2026-11-02 10:15“. */
function vilniusTime(iso: string): string {
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "Europe/Vilnius" }).slice(0, 16);
}

function vilniusDay(iso: string): string {
  return vilniusTime(iso).slice(0, 10);
}

/** Žurnalas laikomas metus atgal – senesni pasiūlymai sprendimams nebeaktualūs. */
function yearAgoIso(): string {
  return new Date(Date.now() - 366 * 86_400_000).toISOString();
}

function percent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(0)} %`;
}

const inputClass = "rounded-md border border-line bg-transparent px-2 py-1";

/**
 * Pasiūlymų žurnalas (Phase 0, 5). Viršuje – ar skaičiuoklė naudojama ir ar
 * jos verdiktai pasitvirtina; žemiau – kiekvienas pasiūlymas, kurio rezultatą
 * galima pataisyti vėliau (pralaimėta būna ir po kelių dienų).
 */
export function QuoteLog() {
  const [rows, setRows] = useState<QuoteRow[]>([]);
  const [plates, setPlates] = useState(new Map<string, string>());
  const [people, setPeople] = useState(new Map<string, string>());
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<QuoteFilters>(() => {
    const today = todayInVilnius();
    return { from: `${today.slice(0, 8)}01`, to: today, decision: "", outcome: "", createdBy: "" };
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const client = getSupabaseClient();
        const [quotes, trucks, members] = await Promise.all([
          listQuotes(client, yearAgoIso()),
          client.from("trucks").select("id,plate"),
          client.from("company_member_emails").select("user_id,email"),
        ]);
        if (cancelled) return;
        setAvailable(quotes.available);
        setRows(quotes.rows);
        setPlates(new Map((trucks.data ?? []).map((truck) => [truck.id as string, truck.plate as string])));
        setPeople(new Map((members.data ?? []).map((member) => [member.user_id as string, member.email as string])));
      } catch {
        if (!cancelled) setError("Nepavyko užkrauti pasiūlymų. Patikrinkite ryšį ir bandykite dar kartą.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <p role="status">Kraunami pasiūlymai…</p>;
  if (error) return <p role="alert" className="text-bad">{error}</p>;
  if (!available) {
    return <p className="rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
      Pasiūlymų žurnalo duomenų bazėje dar nėra – reikia migracijos 0026.
    </p>;
  }

  const shown = filterQuotes(rows, filters, vilniusDay);
  const stats = quoteStats(shown, filters.from, filters.to);
  const who = (id: string | null) => (id ? people.get(id)?.split("@")[0] ?? "—" : "—");
  const set = (patch: Partial<QuoteFilters>) => setFilters((current) => ({ ...current, ...patch }));
  const replace = (next: QuoteRow) => setRows((current) => current.map((row) => (row.id === next.id ? next : row)));

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end gap-3 text-sm">
      <label className="flex flex-col gap-1">Nuo<input type="date" value={filters.from} onChange={(event) => set({ from: event.target.value })} className={inputClass} /></label>
      <label className="flex flex-col gap-1">Iki<input type="date" value={filters.to} onChange={(event) => set({ to: event.target.value })} className={inputClass} /></label>
      <label className="flex flex-col gap-1">Sprendimas
        <select value={filters.decision} onChange={(event) => set({ decision: event.target.value as QuoteDecision | "" })} className={inputClass}>
          <option value="">Visi</option>
          {(Object.keys(DECISION_LABELS) as QuoteDecision[]).map((key) => <option key={key} value={key}>{DECISION_LABELS[key]}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">Rezultatas
        <select value={filters.outcome} onChange={(event) => set({ outcome: event.target.value as QuoteOutcome | "" })} className={inputClass}>
          <option value="">Visi</option>
          {(Object.keys(OUTCOME_LABELS) as QuoteOutcome[]).map((key) => <option key={key} value={key}>{OUTCOME_LABELS[key]}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">Dispečeris
        <select value={filters.createdBy} onChange={(event) => set({ createdBy: event.target.value })} className={inputClass}>
          <option value="">Visi</option>
          {[...people.entries()].map(([id, email]) => <option key={id} value={id}>{email}</option>)}
        </select>
      </label>
    </div>

    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-lg border border-line bg-surface p-4">
        <dt className="text-xs text-muted">Pasiūlymų</dt>
        <dd className="mt-1 text-2xl font-semibold tabular-nums">{stats.count}</dd>
        <dd className="text-xs text-muted">Nuspręsta {stats.decided}</dd>
      </div>
      <div className="rounded-lg border border-line bg-surface p-4">
        <dt className="text-xs text-muted">Per darbo dieną ({stats.workingDays} d.)</dt>
        {stats.byDispatcher.length === 0 ? <dd className="mt-1 text-2xl font-semibold">—</dd> : stats.byDispatcher.map((row) => (
          <dd key={row.createdBy ?? ""} className="mt-1 text-sm tabular-nums">
            <span className="font-semibold">{row.perWorkingDay === null ? "—" : row.perWorkingDay.toFixed(1).replace(".", ",")}</span> {who(row.createdBy)}
          </dd>
        ))}
      </div>
      <div className="rounded-lg border border-line bg-surface p-4">
        <dt className="text-xs text-muted">Laimėta</dt>
        <dd className="mt-1 text-2xl font-semibold tabular-nums">{percent(stats.winRate)}</dd>
        <dd className="text-xs text-muted">{stats.won} laimėta, {stats.lost} pralaimėta</dd>
      </div>
      <div className="rounded-lg border border-line bg-surface p-4">
        <dt className="text-xs text-muted">Sprendimas sutapo su Bramit</dt>
        <dd className="mt-1 text-2xl font-semibold tabular-nums">{percent(stats.followedRate)}</dd>
        <dd className="text-xs text-muted">Imti → paėmėm, Neimti → nepaėmėm, Derėtis → ne pigiau už X</dd>
      </div>
    </dl>

    {stats.reasons.length > 0 && <p className="text-sm text-muted">
      Priežastys: {stats.reasons.map((row) => `${row.reason} (${row.count})`).join(", ")}.
    </p>}

    {shown.length === 0 ? <p className="rounded-lg border border-line bg-surface px-6 py-10 text-center text-sm text-muted">
      Šiuo laikotarpiu pasiūlymų nėra. Jie atsiranda patys, kai{" "}
      <Link href="/trips/new" className="font-semibold text-good underline">reiso formoje</Link> suskaičiuojama kaina.
    </p> : <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="px-4 py-3 font-medium">Kada</th>
            <th className="px-3 py-3 font-medium">Maršrutas</th>
            <th className="px-3 py-3 font-medium">Fura</th>
            <th className="px-3 py-3 text-right font-medium">Kaina</th>
            <th className="px-3 py-3 font-medium">Bramit</th>
            <th className="px-3 py-3 font-medium">Sprendimas</th>
            <th className="px-3 py-3 font-medium">Rezultatas</th>
            <th className="px-3 py-3 font-medium">Galutinė</th>
            <th className="px-3 py-3 font-medium">Priežastis</th>
            <th className="px-3 py-3 font-medium">Kas</th>
            <th className="px-4 py-3 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {shown.map((row) => <QuoteLine key={row.id} row={row} plate={row.truck_id ? plates.get(row.truck_id) ?? "—" : "—"} who={who(row.created_by)} onSaved={replace} />)}
        </tbody>
      </table>
    </div>}
  </div>;
}

function QuoteLine({ row, plate, who, onSaved }: { row: QuoteRow; plate: string; who: string; onSaved: (row: QuoteRow) => void }) {
  const [finalText, setFinalText] = useState(row.final_price_cents === null ? "" : centsToInput(row.final_price_cents));
  const [reason, setReason] = useState(row.reason ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(patch: Partial<Pick<QuoteRow, "outcome" | "reason" | "final_price_cents">>) {
    setSaving(true);
    setError("");
    try {
      await updateQuote(getSupabaseClient(), row.id, patch);
      onSaved({ ...row, ...patch });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Neišsaugota.");
    } finally {
      setSaving(false);
    }
  }

  function saveFinal() {
    const text = finalText.trim();
    const cents = text === "" ? null : parseEuroToCents(text);
    if (text !== "" && cents === null) { setError("Kaina – eurais."); return; }
    if (cents !== row.final_price_cents) void save({ final_price_cents: cents });
  }

  function saveReason() {
    const text = reason.trim().slice(0, 500);
    if (text !== (row.reason ?? "")) void save({ reason: text === "" ? null : text });
  }

  const verdictColor = row.verdict === "take" ? "text-good" : row.verdict === "negotiate" ? "text-warn" : "text-bad";

  return <tr className="align-top">
    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{vilniusTime(row.created_at)}<span className="block text-xs text-muted">krovinys {row.trip_date ?? "—"}</span></td>
    <td className="px-3 py-3">{row.origin} → {row.destination}<span className="block text-xs text-muted">{SOURCE_LABELS[row.source]}</span></td>
    <td className="whitespace-nowrap px-3 py-3">{plate}</td>
    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{row.offered_price_cents === null ? "—" : formatCents(row.offered_price_cents)}</td>
    <td className="whitespace-nowrap px-3 py-3">
      {row.verdict ? <span className={`font-semibold ${verdictColor}`}>
        {row.verdict === "negotiate" && row.target_price_cents !== null ? `Derėtis iki ${formatCents(row.target_price_cents)}` : VERDICT_LABELS[row.verdict]}
      </span> : "—"}
      {row.contribution_per_day_cents !== null && <span className="block text-xs tabular-nums text-muted">{formatCents(row.contribution_per_day_cents)} / parą</span>}
    </td>
    <td className="whitespace-nowrap px-3 py-3">{DECISION_LABELS[row.decision]}</td>
    <td className="px-3 py-3">
      <select value={row.outcome} disabled={saving} onChange={(event) => void save({ outcome: event.target.value as QuoteOutcome })} aria-label="Rezultatas" className={inputClass}>
        {(Object.keys(OUTCOME_LABELS) as QuoteOutcome[]).map((key) => <option key={key} value={key}>{OUTCOME_LABELS[key]}</option>)}
      </select>
    </td>
    <td className="px-3 py-3">
      <input type="text" inputMode="decimal" value={finalText} disabled={saving} onChange={(event) => setFinalText(event.target.value)} onBlur={saveFinal}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} placeholder="—" aria-label="Galutinė kaina, €" className={`${inputClass} w-24 text-right tabular-nums`} />
    </td>
    <td className="px-3 py-3">
      <input type="text" list="quote-reasons" value={reason} disabled={saving} onChange={(event) => setReason(event.target.value)} onBlur={saveReason}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} placeholder="—" aria-label="Priežastis" className={`${inputClass} w-44`} />
      <datalist id="quote-reasons">{QUOTE_REASONS.map((item) => <option key={item} value={item} />)}</datalist>
      {error && <span role="alert" className="mt-1 block text-xs text-bad">{error}</span>}
    </td>
    <td className="whitespace-nowrap px-3 py-3 text-muted">{who}</td>
    <td className="whitespace-nowrap px-4 py-3">
      {row.trip_id
        ? <Link href={`/trips/${row.trip_id}/edit`} className="underline">Reisas</Link>
        : <Link href={`/trips/new?quote=${row.id}`} className="font-medium text-good underline">Paversti reisu</Link>}
    </td>
  </tr>;
}
