"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../../lib/supabase";
import { formatCents, parseEuroToCents } from "../../../lib/money";
import { calculateSavedTrip } from "../../../lib/trip-input";
import { saveTrip } from "../../../lib/trips";
import type { CountryTariff, TripResult } from "../../../lib/calc";
import type { Truck } from "../../../types/truck";
import type { TripInsert } from "../../../types/trip";

const fields = [
  ["days", "Trip duration (days)", "1"],
  ["paid_km", "Paid distance (km)", "0.01"],
  ["empty_km", "Empty distance (km)", "0.01"],
  ["fuel_l_per_100km", "Fuel consumption (L/100 km)", "0.0001"],
  ["fuel_price", "Fuel price (€/L)", "0.0001"],
  ["adblue_l_per_100km", "AdBlue consumption (L/100 km)", "0.0001"],
  ["adblue_price", "AdBlue price (€/L)", "0.0001"],
] as const;
const extras = [["bridges_cents", "Bridges / vignettes (€)"], ["ferries_cents", "Ferries (€)"], ["tunnels_cents", "Tunnels (€)"], ["parking_cents", "Parking (€)"]] as const;
const inputClass = "mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3";

export function TripForm() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [tariffs, setTariffs] = useState<CountryTariff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("freight");
  const [legIds, setLegIds] = useState([0]);
  const nextId = useRef(1);
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<TripResult | null>(null);
  const [saved, setSaved] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const client = getSupabaseClient();
        const [t, c] = await Promise.all([client.from("trucks").select("*").order("plate"), client.from("country_tariffs").select("country,rate,rate_type").order("country")]);
        if (t.error) throw t.error;
        if (c.error) throw c.error;
        if (!cancelled) {
          setTrucks(t.data as Truck[]);
          setTariffs(c.data.map(row => ({ country: row.country, rate: Number(row.rate), rateType: row.rate_type })));
        }
      } catch {
        if (!cancelled) setError("Could not load trucks and road tariffs. Check the connection and try again.");
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [attempt]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const number = (name: string) => {
      const value = Number(text(name));
      if (!text(name) || !Number.isFinite(value) || value < 0) throw new Error("Enter valid non-negative numbers.");
      return value;
    };
    const cents = (name: string) => {
      const value = parseEuroToCents(text(name));
      if (value === null || value > 2147483647) throw new Error("Enter monetary amounts with at most two decimal places.");
      return value;
    };
    setError("");
    setSaved("");
    try {
      const truck = trucks.find(t => t.id === text("truck_id"));
      if (!truck) throw new Error("Select a truck.");
      for (const key of ["trip_number", "origin", "destination", "trip_date"]) {
        if (!text(key)) throw new Error("Complete the route details.");
      }
      const trip: TripInsert = {
        trip_number: text("trip_number"), origin: text("origin"), destination: text("destination"), trip_date: text("trip_date"), truck_id: truck.id,
        days: number("days"), paid_km: number("paid_km"), empty_km: number("empty_km"),
        fuel_l_per_100km: number("fuel_l_per_100km"), fuel_price: number("fuel_price"),
        adblue_l_per_100km: number("adblue_l_per_100km"), adblue_price: number("adblue_price"),
        bridges_cents: cents("bridges_cents"), ferries_cents: cents("ferries_cents"), tunnels_cents: cents("tunnels_cents"), parking_cents: cents("parking_cents"),
        revenue_mode: mode === "freight" ? "freight" : "per_km",
        freight_price_cents: mode === "freight" ? cents("revenue") : null,
        rate_per_km: mode === "per_km" ? number("revenue") : null,
      };
      if (!Number.isInteger(trip.days) || trip.days < 1) throw new Error("Trip duration must be a positive whole number.");
      const legs = legIds.map(id => ({ country: text(`country-${id}`), km: number(`km-${id}`) }));
      if (Math.abs(legs.reduce((sum, l) => sum + l.km, 0) - trip.paid_km - trip.empty_km) > 0.005) throw new Error("Country distances must add up to paid plus empty kilometres.");
      const calculation = calculateSavedTrip(trip, legs, truck, tariffs);
      setResult(calculation);
      const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
      if (action !== "save") return;
      busy.current = true;
      setSaving(true);
      const persisted = await saveTrip(trip, legs);
      setSaved(`Trip ${persisted.trip_number} saved successfully.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save trip. Check the database connection and that migration 0004 is applied.");
    } finally { busy.current = false; setSaving(false); }
  }

  if (loading) return <p role="status">Loading trucks and road tariffs…</p>;
  if (!trucks.length || !tariffs.length) return <div><p role="alert">{error || "Add trucks and country tariffs before creating trips."}</p><button type="button" className="mt-3 underline" onClick={() => { setLoading(true); setError(""); setAttempt(a => a + 1); }}>Retry</button></div>;

  return <form onSubmit={submit} onChange={() => { setResult(null); setSaved(""); }} className="space-y-6">
    <fieldset disabled={saving} className="space-y-6 disabled:opacity-60">
      <div className="grid gap-4 sm:grid-cols-2">
        <label>Truck<select name="truck_id" required className={inputClass}><option value="">Select a truck</option>{trucks.map(t => <option key={t.id} value={t.id}>{t.plate}</option>)}</select></label>
        {[["trip_number", "Trip number"], ["origin", "Origin"], ["destination", "Destination"], ["trip_date", "Date"]].map(([name, label]) => <label key={name}>{label}<input name={name} type={name === "trip_date" ? "date" : "text"} required className={inputClass} /></label>)}
        {fields.map(([name, label, step]) => <label key={name}>{label}<input name={name} type="number" min={name === "days" ? 1 : 0} max={name === "days" ? 2147483647 : undefined} step={step} required className={inputClass} defaultValue={name.startsWith("adblue") || name === "empty_km" ? "0" : undefined} /></label>)}
        <label>Revenue type<select className={inputClass} value={mode} onChange={e => setMode(e.target.value)}><option value="freight">Freight price</option><option value="per_km">Price per paid km</option></select></label>
        <label>{mode === "freight" ? "Freight price (€)" : "Rate (€/km)"}<input key={mode} name="revenue" required type={mode === "freight" ? "text" : "number"} inputMode="decimal" min="0" step="0.0001" className={inputClass} /></label>
      </div>
      <section className="space-y-3"><h2 className="font-semibold">Road distances by country</h2><p className="text-sm text-slate-600">Include all kilometres. Select the free-road tariff for untolled distances.</p>
        {legIds.map(id => <div key={id} className="flex flex-wrap items-end gap-3"><label className="flex-1">Country<select required name={`country-${id}`} className={inputClass}><option value="">Select country</option>{tariffs.map(t => <option key={t.country} value={t.country}>{t.country}</option>)}</select></label><label>Distance (km)<input name={`km-${id}`} type="number" min="0" step="0.01" required className={inputClass} /></label><button type="button" disabled={legIds.length === 1} onClick={() => { setLegIds(ids => ids.filter(i => i !== id)); setResult(null); setSaved(""); }} className="p-3 underline disabled:opacity-40">Remove</button></div>)}
        <button type="button" className="underline" onClick={() => { setLegIds(ids => [...ids, nextId.current++]); setResult(null); setSaved(""); }}>Add country</button>
      </section>
      <div className="grid gap-4 sm:grid-cols-2">{extras.map(([name, label]) => <label key={name}>{label}<input name={name} type="text" inputMode="decimal" required defaultValue="0" className={inputClass} /></label>)}</div>
      <p className="text-sm text-slate-600">Driver, insurance, depreciation and trailer costs come from the selected truck’s daily cost.</p>
      <div className="flex gap-3"><button type="submit" value="calculate" className="rounded-lg border p-3">Calculate</button><button type="submit" value="save" disabled={!!saved} className="rounded-lg bg-blue-600 p-3 text-white disabled:opacity-50">{saving ? "Saving…" : "Save Trip"}</button></div>
    </fieldset>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {saved && <p role="status" className="text-green-800">{saved}</p>}
    {result && <section aria-label="Trip results" className="rounded-xl bg-slate-50 p-4"><h2 className="font-semibold">Trip results</h2><dl className="mt-3 grid gap-3 sm:grid-cols-2">{[["Fuel", result.fuelCents], ["AdBlue", result.adblueCents], ["Roads", result.roadCents], ["Truck", result.truckCents], ["Revenue", result.revenueCents], ["Total cost", result.totalCostCents], ["Profit", result.profitCents]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="font-semibold">{formatCents(Number(value))}</dd></div>)}<div><dt>Margin</dt><dd>{result.marginPercent === null ? "—" : `${result.marginPercent.toFixed(1)}%`}</dd></div><div><dt>Profit / paid km</dt><dd>{result.profitPerKm === null ? "—" : `${result.profitPerKm.toFixed(2)} €/km`}</dd></div></dl></section>}
  </form>;
}
