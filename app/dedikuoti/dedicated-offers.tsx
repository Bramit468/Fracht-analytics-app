"use client";

import { useEffect, useState } from "react";

import { calcDailyRate } from "../../lib/calc";
import {
  calcDedicated,
  NEGOTIATION_QUESTIONS,
  OFFER_STATUSES,
  parseDedicatedForm,
  PRICING_MODELS,
  sensitivity,
  suggestPrice,
  type DedicatedFormValues,
  type DedicatedOffer,
  type DedicatedOfferInsert,
} from "../../lib/dedicated";
import { centsToInput, formatCents } from "../../lib/money";
import { getSupabaseClient } from "../../lib/supabase";
import { truckRowToCalc } from "../../lib/truck";
import type { Truck } from "../../types/truck";

const inputClass = "mt-1 block w-full rounded-lg border border-line bg-surface p-3";

const EMPTY: DedicatedFormValues = { pricing_model: "km_with_min", status: "draft", margin_percent: "15", empty_km_month: "0" };

/** Lentelės nėra – migracija 0018 nepaleista. */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

function offerToValues(offer: DedicatedOffer): DedicatedFormValues {
  const values: DedicatedFormValues = {
    title: offer.title,
    customer: offer.customer ?? "",
    truck_id: offer.truck_id ?? "",
    status: offer.status,
    truck_daily_cents: centsToInput(offer.truck_daily_cents),
    monthly_fee_cents: centsToInput(offer.monthly_fee_cents),
    pricing_model: offer.pricing_model,
    notes: offer.notes ?? "",
  };
  for (const field of ["paid_km_month", "empty_km_month", "fuel_l_per_100km", "fuel_price", "adblue_l_per_100km", "adblue_price", "toll_per_km", "rate_per_km", "min_km_month", "margin_percent"] as const) {
    values[field] = String(Number(offer[field]));
  }
  for (const [key, answer] of Object.entries(offer.terms ?? {})) values[`term_${key}`] = String(answer);
  return values;
}

/** PostgREST `numeric` grąžina tekstu – skaičiavimui reikia skaičių. */
function rowToOffer(row: Record<string, unknown>): DedicatedOffer {
  const parsed = parseDedicatedForm(offerToValues(row as unknown as DedicatedOffer));
  const base = row as unknown as DedicatedOffer;
  return parsed.ok ? { ...parsed.value, id: base.id, created_at: base.created_at } : base;
}

function km(value: number): string {
  return `${Math.round(value).toLocaleString("lt-LT")} km`;
}

export function DedicatedOffers() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [offers, setOffers] = useState<DedicatedOffer[]>([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<DedicatedFormValues>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadOffers() {
    const { data, error } = await getSupabaseClient().from("dedicated_offers").select("*").order("created_at", { ascending: false });
    if (isMissingTable(error)) { setAvailable(false); return; }
    if (error) throw error;
    setOffers((data ?? []).map(rowToOffer));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await getSupabaseClient().from("trucks").select("*").order("plate");
        if (error) throw error;
        if (!cancelled) setTrucks((data ?? []) as Truck[]);
        await loadOffers();
      } catch {
        if (!cancelled) setMessage("Nepavyko užkrauti duomenų. Patikrinkite ryšį ir bandykite dar kartą.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const set = (name: string, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    setMessage("");
  };

  /** Pasirinkus furą – jos paros savikaina ir normos; viską galima pataisyti. */
  function pickTruck(id: string) {
    const truck = trucks.find((candidate) => candidate.id === id);
    setValues((current) => ({
      ...current,
      truck_id: id,
      ...(truck ? {
        truck_daily_cents: centsToInput(calcDailyRate(truckRowToCalc(truck))),
        ...(truck.fuel_norm_l_per_100km != null ? { fuel_l_per_100km: String(truck.fuel_norm_l_per_100km) } : {}),
        ...(truck.adblue_norm_l_per_100km != null ? { adblue_l_per_100km: String(truck.adblue_norm_l_per_100km) } : {}),
      } : {}),
    }));
  }

  async function save() {
    const parsed = parseDedicatedForm(values);
    if (!parsed.ok) { setErrors(parsed.errors); setMessage("Pataisykite pažymėtus laukus."); return; }
    setErrors({});
    setSaving(true);
    try {
      const table = getSupabaseClient().from("dedicated_offers");
      const { data, error } = editingId
        ? await table.update(parsed.value).eq("id", editingId).select("id").single()
        : await table.insert(parsed.value).select("id").single();
      if (error) throw error;
      setEditingId(data.id);
      await loadOffers();
      setMessage("Pasiūlymas išsaugotas.");
    } catch {
      setMessage("Nepavyko išsaugoti pasiūlymo. Patikrinkite ryšį ir ar paleista migracija 0018.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(offer: DedicatedOffer) {
    if (!window.confirm(`Ištrinti pasiūlymą „${offer.title}“?`)) return;
    const { error } = await getSupabaseClient().from("dedicated_offers").delete().eq("id", offer.id);
    if (error) { setMessage("Nepavyko ištrinti pasiūlymo."); return; }
    if (editingId === offer.id) { setEditingId(null); setValues(EMPTY); }
    await loadOffers();
  }

  if (loading) return <p role="status">Kraunama…</p>;

  // Skaičiuojama ir be pavadinimo: jis reikalingas tik įrašant.
  const parsed = parseDedicatedForm({ ...values, title: values.title?.trim() || "—" });
  const offer: DedicatedOfferInsert | null = parsed.ok ? parsed.value : null;
  const result = offer ? calcDedicated(offer) : null;
  const suggestion = offer ? suggestPrice(offer, offer.margin_percent) : null;
  const fixed = values.pricing_model === "fixed_plus_km";

  const field = (name: string, label: string, hint?: string) => <label key={name} className="text-sm">
    {label}
    <input type="text" inputMode={name === "title" || name === "customer" ? "text" : "decimal"} value={values[name] ?? ""} onChange={(event) => set(name, event.target.value)} aria-invalid={!!errors[name]} className={inputClass} />
    {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    {errors[name] && <span className="mt-1 block text-xs text-bad">{errors[name]}</span>}
  </label>;

  return <div className="space-y-6">
    {!available && <p className="rounded-xl border border-warn bg-warn-soft p-4 text-sm text-warn">
      Pasiūlymų lentelės dar nėra – Supabase paleiskite migraciją 0018. Skaičiuoti galima jau dabar, įrašyti – ne.
    </p>}

    {offers.length > 0 && <section className="overflow-x-auto rounded-xl border p-4">
      <h2 className="mb-3 font-semibold">Įrašyti pasiūlymai</h2>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-line text-left text-muted">
          <th className="py-2 pr-3 font-normal">Pasiūlymas</th>
          <th className="py-2 pr-3 font-normal">Būsena</th>
          <th className="py-2 pr-3 text-right font-normal">Km/mėn.</th>
          <th className="py-2 pr-3 text-right font-normal">Pelnas/mėn.</th>
          <th className="py-2 text-right font-normal"><span className="sr-only">Veiksmai</span></th>
        </tr></thead>
        <tbody>{offers.map((saved) => {
          const outcome = calcDedicated(saved);
          return <tr key={saved.id} className={`border-b border-line ${saved.id === editingId ? "bg-raised" : ""}`}>
            <td className="py-2 pr-3">{saved.title}{saved.customer && <span className="block text-xs text-muted">{saved.customer}</span>}</td>
            <td className="py-2 pr-3">{OFFER_STATUSES[saved.status]}</td>
            <td className="py-2 pr-3 text-right tabular-nums">{km(outcome.billableKm)}</td>
            <td className={`py-2 pr-3 text-right tabular-nums ${outcome.profitCents < 0 ? "text-bad" : ""}`}>{formatCents(outcome.profitCents)}</td>
            <td className="py-2 text-right whitespace-nowrap">
              <button type="button" className="underline" onClick={() => { setEditingId(saved.id); setValues(offerToValues(saved)); setErrors({}); setMessage(""); }}>Atidaryti</button>
              {" · "}
              <button type="button" className="underline text-bad" onClick={() => void remove(saved)}>Ištrinti</button>
            </td>
          </tr>;
        })}</tbody>
      </table>
    </section>}

    <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-6">
      <section className="rounded-xl border p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">{editingId ? "Taisomas pasiūlymas" : "Naujas pasiūlymas"}</h2>
          {editingId && <button type="button" className="text-sm underline" onClick={() => { setEditingId(null); setValues(EMPTY); setErrors({}); setMessage(""); }}>Pradėti naują</button>}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {field("title", "Pavadinimas *")}
          {field("customer", "Užsakovas")}
          <label className="text-sm">Būsena
            <select value={values.status ?? "draft"} onChange={(event) => set("status", event.target.value)} className={inputClass}>
              {Object.entries(OFFER_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="mb-3 font-semibold">Fura ir rida per mėnesį</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm">Fura
            <select value={values.truck_id ?? ""} onChange={(event) => pickTruck(event.target.value)} className={inputClass}>
              <option value="">Nepasirinkta</option>
              {trucks.map((truck) => <option key={truck.id} value={truck.id}>{truck.plate}</option>)}
            </select>
          </label>
          {field("truck_daily_cents", "Furos paros savikaina, €", "Su vairuotoju; kalendorinė para.")}
          {field("paid_km_month", "Apmokami km per mėnesį *", "Kiek žada užsakovas.")}
          {field("empty_km_month", "Tušti km per mėnesį")}
          {field("fuel_l_per_100km", "Kuro norma, l/100 km")}
          {field("fuel_price", "Kuro kaina, €/l")}
          {field("adblue_l_per_100km", "AdBlue norma, l/100 km")}
          {field("adblue_price", "AdBlue kaina, €/l")}
          {field("toll_per_km", "Keliai vidutiniškai, €/km")}
        </div>
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="mb-3 font-semibold">Kaina</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm">Kainos modelis
            <select value={values.pricing_model ?? ""} onChange={(event) => set("pricing_model", event.target.value)} className={inputClass}>
              {Object.entries(PRICING_MODELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          {fixed && field("monthly_fee_cents", "Fiksuotas mokestis, €/mėn.")}
          {field("rate_per_km", "Įkainis, €/km")}
          {!fixed && field("min_km_month", "Minimalūs km per mėnesį")}
          {field("margin_percent", "Norima marža, %")}
        </div>
      </section>

      {!result && <p className="text-sm text-muted">Įveskite furos paros savikainą ir km per mėnesį – rezultatas atsiras čia.</p>}

      {result && offer && <section aria-label="Pasiūlymo rezultatai" className="rounded-xl border-2 border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-semibold">Per mėnesį</h2>
          <p className={`text-2xl font-bold ${result.profitCents >= 0 ? "text-good" : "text-bad"}`}>
            {formatCents(result.profitCents)} {result.profitCents >= 0 ? "pelnas" : "nuostolis"}
          </p>
        </div>
        <p className="mt-1 text-sm text-muted">
          Marža {result.marginPercent === null ? "—" : `${result.marginPercent.toFixed(1)} %`}
          {" · "}savikaina {result.costPerKm === null ? "—" : `${result.costPerKm.toFixed(3)} €/km`}
          {" · "}{formatCents(result.costPerDayCents)} per parą
        </p>

        <dl className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-3">
          {([["Fura su vairuotoju", result.truckCents], ["Kuras", result.fuelCents], ["AdBlue", result.adblueCents], ["Keliai", result.tollCents], ["Kaštai iš viso", result.totalCostCents], ["Pajamos", result.revenueCents]] as const).map(([label, cents]) =>
            <div key={label}><dt className="text-sm text-muted">{label}</dt><dd className="font-semibold tabular-nums">{formatCents(cents)}</dd></div>)}
        </dl>

        <p className={`mt-4 rounded-lg p-3 text-sm ${result.breakEvenKm === null || result.breakEvenKm > result.billableKm ? "bg-bad-soft text-bad" : "bg-page"}`}>
          {result.breakEvenKm === null
            ? "Šis €/km nepadengia net kuro ir kelių – nuostolis su kiekvienu km."
            : <>Lūžio taškas: <strong>{km(result.breakEvenKm)}</strong> per mėnesį. {fixed
              ? "Tiek apmokamų km reikia, kad mokestis ir €/km padengtų visus kaštus."
              : "Mažesnio minimumo sutartyje sutikti neverta – fura nepasidengs."}</>}
        </p>

        {suggestion && (suggestion.ratePerKm !== null || suggestion.monthlyFeeCents !== null) && <div className="mt-4 border-t pt-4 text-sm">
          <p>
            Kaina su {offer.margin_percent} % marža:{" "}
            {suggestion.monthlyFeeCents !== null && <><strong className="tabular-nums">{formatCents(suggestion.monthlyFeeCents)}/mėn.</strong> + </>}
            <strong className="tabular-nums">{suggestion.ratePerKm === null ? "—" : `${suggestion.ratePerKm.toFixed(3)} €/km`}</strong>
            {suggestion.minKm !== null && <>, minimumas bent <strong>{km(suggestion.minKm)}</strong></>}
            {" "}
            <button type="button" className="underline" onClick={() => setValues((current) => ({
              ...current,
              ...(suggestion.monthlyFeeCents !== null ? { monthly_fee_cents: centsToInput(suggestion.monthlyFeeCents) } : {}),
              ...(suggestion.ratePerKm !== null ? { rate_per_km: suggestion.ratePerKm.toFixed(3) } : {}),
              ...(suggestion.minKm !== null ? { min_km_month: String(Math.max(suggestion.minKm, Number(current.min_km_month) || 0)) } : {}),
            }))}>Naudoti</button>
          </p>
          {fixed && <p className="mt-1 text-muted">Mokestis dengia furą ir vairuotoją, €/km – kurą ir kelius: pelnas nepriklauso nuo to, kiek užsakovas apkraus.</p>}
        </div>}

        <div className="mt-4 overflow-x-auto border-t pt-4">
          <h3 className="text-sm font-semibold">Jei užsakovas apkraus kitaip</h3>
          <table className="mt-2 w-full text-sm tabular-nums">
            <thead><tr className="text-muted"><th className="py-1 text-left font-normal">Apkrova</th><th className="py-1 text-right font-normal">Km</th><th className="py-1 text-right font-normal">Pelnas</th><th className="py-1 text-right font-normal">Marža</th></tr></thead>
            <tbody>{sensitivity(offer).map((row) => <tr key={row.share} className="border-t border-line">
              <td className="py-1">{Math.round(row.share * 100)} %</td>
              <td className="py-1 text-right">{km(row.billableKm)}</td>
              <td className={`py-1 text-right ${row.profitCents < 0 ? "text-bad" : ""}`}>{formatCents(row.profitCents)}</td>
              <td className="py-1 text-right">{row.marginPercent === null ? "—" : `${row.marginPercent.toFixed(1)} %`}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>}

      <section className="rounded-xl border p-4">
        <h2 className="font-semibold">Derybiniai klausimai</h2>
        <p className="mt-1 text-sm text-muted">Kuras, keliai, tušti km ir minimumas keičia skaičiavimą viršuje.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {NEGOTIATION_QUESTIONS.map((question) => "options" in question
            ? <label key={question.key} className="text-sm">{question.label}
              <select value={values[`term_${question.key}`] ?? ""} onChange={(event) => set(`term_${question.key}`, event.target.value)} className={inputClass}>
                <option value="">Nesutarta</option>
                {question.options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            : field(`term_${question.key}`, question.label))}
        </div>
        <label className="mt-4 block text-sm">Pastabos
          <textarea value={values.notes ?? ""} onChange={(event) => set("notes", event.target.value)} rows={3} className={inputClass} />
          {errors.notes && <span className="mt-1 block text-xs text-bad">{errors.notes}</span>}
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving || !available} className="rounded-lg bg-accent p-3 text-accent-ink disabled:opacity-50">
          {saving ? "Saugoma…" : editingId ? "Išsaugoti pakeitimus" : "Išsaugoti pasiūlymą"}
        </button>
        {message && <p role="status" className={message.startsWith("Pasiūlymas") ? "text-good" : "text-bad"}>{message}</p>}
      </div>
    </form>
  </div>;
}
