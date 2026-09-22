"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { getSupabaseClient } from "../../../lib/supabase";
import { centsToInput, formatCents, parseEuroToCents } from "../../../lib/money";
import { calculateSavedTrip } from "../../../lib/trip-input";
import { truckRowToCalc } from "../../../lib/truck";
import { getTripWithLegs, saveTrip } from "../../../lib/trips";
import { fetchTelematicsFill } from "./telematics";
import type { CountryTariff, TripResult } from "../../../lib/calc";
import type { Truck } from "../../../types/truck";
import type { TripInsert, TripWithLegs } from "../../../types/trip";

const fields = [
  ["days", "Reiso trukmė (paros)", "1"],
  ["paid_km", "Apmokami km", "0.01"],
  ["empty_km", "Tušti km", "0.01"],
  ["fuel_l_per_100km", "Kuro sąnaudos (l/100 km)", "0.0001"],
  ["fuel_price", "Kuro kaina (€/l)", "0.0001"],
  ["adblue_l_per_100km", "AdBlue sąnaudos (l/100 km)", "0.0001"],
  ["adblue_price", "AdBlue kaina (€/l)", "0.0001"],
] as const;
const extras = [["bridges_cents", "Tiltai / vinjetės (€)"], ["ferries_cents", "Keltai (€)"], ["tunnels_cents", "Tuneliai (€)"], ["parking_cents", "Parkingas (€)"]] as const;
const inputClass = "mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3";

/** Išsaugotas reisas -> formos laukų reikšmės. Sumos verčiamos atgal į eurus. */
function tripDefaults(trip: TripWithLegs): Record<string, string> {
  return {
    truck_id: trip.truck_id, trip_number: trip.trip_number, origin: trip.origin,
    destination: trip.destination, trip_date: trip.trip_date,
    days: String(trip.days), paid_km: String(trip.paid_km), empty_km: String(trip.empty_km),
    fuel_l_per_100km: String(trip.fuel_l_per_100km), fuel_price: String(trip.fuel_price),
    adblue_l_per_100km: String(trip.adblue_l_per_100km), adblue_price: String(trip.adblue_price),
    bridges_cents: centsToInput(trip.bridges_cents), ferries_cents: centsToInput(trip.ferries_cents),
    tunnels_cents: centsToInput(trip.tunnels_cents), parking_cents: centsToInput(trip.parking_cents),
    revenue: trip.revenue_mode === "freight"
      ? centsToInput(trip.freight_price_cents ?? 0)
      : String(trip.rate_per_km ?? 0),
  };
}

export function TripForm({ tripId }: { tripId?: string }) {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [tariffs, setTariffs] = useState<CountryTariff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("freight");
  const [legs, setLegs] = useState([{ id: 0, country: "", km: "" }]);
  const nextId = useRef(1);
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [telematika, setTelematika] = useState("");
  const [pildoma, setPildoma] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<TripResult | null>(null);
  const [saved, setSaved] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const client = getSupabaseClient();
        const [t, c, existing] = await Promise.all([
          client.from("trucks").select("*").order("plate"),
          client.from("country_tariffs").select("country,rate,rate_type").order("country"),
          tripId ? getTripWithLegs(tripId) : null,
        ]);
        if (t.error) throw t.error;
        if (c.error) throw c.error;
        if (!cancelled) {
          setTrucks(t.data as Truck[]);
          setTariffs(c.data.map(row => ({ country: row.country, rate: Number(row.rate), rateType: row.rate_type })));
          if (existing) {
            setDefaults(tripDefaults(existing));
            setMode(existing.revenue_mode);
            if (existing.legs.length) {
              setLegs(existing.legs.map((leg, index) => ({ id: index, country: leg.country, km: String(leg.km) })));
              nextId.current = existing.legs.length;
            }
          }
        }
      } catch {
        if (!cancelled) setError(tripId
          ? "Nepavyko užkrauti reiso. Patikrinkite ryšį ir bandykite dar kartą."
          : "Nepavyko užkrauti furų ir kelių įkainių. Patikrinkite ryšį ir bandykite dar kartą.");
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [attempt, tripId]);

  /** Užpildo laukus faktiniais duomenimis. Vartotojas gali juos taisyti. */
  async function fillFromTelematics() {
    const form = formRef.current;
    if (!form || pildoma) return;

    const value = (name: string) => {
      const field = form.elements.namedItem(name);
      return field instanceof HTMLInputElement || field instanceof HTMLSelectElement ? field.value : "";
    };
    const plate = trucks.find(t => t.id === value("truck_id"))?.plate ?? "";

    setPildoma(true);
    setTelematika("");
    try {
      const result = await fetchTelematicsFill(plate, value("tele_from"), value("tele_to"));
      if (!result.ok) {
        setTelematika(result.message);
        return;
      }

      for (const [name, filled] of Object.entries(result.fill)) {
        if (name === "legKm" || filled === "") continue;
        const field = form.elements.namedItem(name);
        if (field instanceof HTMLInputElement) field.value = filled;
      }

      // Atkarpos pakeičiamos viena „Nemokami" – tikri keliai jau suvesti kaip
      // sumokėta suma, todėl įkainis pagal šalis čia tik dubliuotų kaštus.
      setLegs([{ id: nextId.current++, country: "Nemokami", km: result.fill.legKm }]);
      setResult(null);
      setSaved("");
      const praleista = result.skippedRows > 0
        ? ` Neįtraukta ${result.skippedRows} pirkim. kita valiuta (${result.skippedCurrencies.join(", ")}) — kurą ir kelius patikrinkite patys.`
        : "";
      setTelematika(`Užpildyta: ${Math.round(result.km)} km, keliai ${formatCents(result.tollCents)}. Tuščius km atskirkite patys.${praleista}`);
    } catch {
      setTelematika("Nepavyko susisiekti su telematika.");
    } finally {
      setPildoma(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const number = (name: string) => {
      const value = Number(text(name));
      if (!text(name) || !Number.isFinite(value) || value < 0) throw new Error("Įveskite neneigiamus skaičius.");
      return value;
    };
    const cents = (name: string) => {
      const value = parseEuroToCents(text(name));
      if (value === null || value > 2147483647) throw new Error("Sumas įveskite eurais, ne daugiau kaip du skaitmenys po kablelio.");
      return value;
    };
    setError("");
    setSaved("");
    try {
      const truck = trucks.find(t => t.id === text("truck_id"));
      if (!truck) throw new Error("Pasirinkite furą.");
      for (const key of ["trip_number", "origin", "destination", "trip_date"]) {
        if (!text(key)) throw new Error("Užpildykite reiso duomenis.");
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
      if (!Number.isInteger(trip.days) || trip.days < 1) throw new Error("Reiso trukmė turi būti sveikas skaičius, didesnis už nulį.");
      const tripLegs = legs.map(({ id }) => ({ country: text(`country-${id}`), km: number(`km-${id}`) }));
      if (Math.abs(tripLegs.reduce((sum, l) => sum + l.km, 0) - trip.paid_km - trip.empty_km) > 0.005) throw new Error("Šalių atkarpų suma turi sutapti su apmokamų ir tuščių km suma.");
      const calculation = calculateSavedTrip(trip, tripLegs, truckRowToCalc(truck), tariffs);
      setResult(calculation);
      const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
      if (action !== "save") return;
      busy.current = true;
      setSaving(true);
      const persisted = await saveTrip({ ...trip, id: tripId }, tripLegs);
      setSaved(tripId
        ? `Reiso ${persisted.trip_number} pakeitimai išsaugoti.`
        : `Reisas ${persisted.trip_number} išsaugotas.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nepavyko išsaugoti reiso. Patikrinkite ryšį su duomenų baze ir ar pritaikyta migracija 0004.");
    } finally { busy.current = false; setSaving(false); }
  }

  if (loading) return <p role="status">{tripId ? "Kraunamas reisas…" : "Kraunamos furos ir kelių įkainiai…"}</p>;
  if (!trucks.length || !tariffs.length) return <div><p role="alert">{error || "Pirma įveskite furas ir šalių įkainius."}</p><button type="button" className="mt-3 underline" onClick={() => { setLoading(true); setError(""); setAttempt(a => a + 1); }}>Bandyti dar kartą</button></div>;

  return <form ref={formRef} onSubmit={submit} onChange={() => { setResult(null); setSaved(""); }} className="space-y-6">
    <fieldset disabled={saving} className="space-y-6 disabled:opacity-60">
      <section className="rounded-xl bg-slate-50 p-4">
        <h2 className="font-semibold">Užpildyti iš telematikos</h2>
        <p className="text-sm text-slate-600">Pasirinkite furą ir laikotarpį – km, kuras ir sumokėti keliai bus paimti iš tikrų duomenų.</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">Nuo<input name="tele_from" type="date" className={inputClass} /></label>
          <label className="text-sm">Iki<input name="tele_to" type="date" className={inputClass} /></label>
          <button type="button" disabled={pildoma} onClick={() => void fillFromTelematics()} className="rounded-lg border bg-white p-3 disabled:opacity-50">
            {pildoma ? "Imama…" : "Užpildyti"}
          </button>
        </div>
        {telematika && <p role="status" className="mt-3 text-sm text-slate-700">{telematika}</p>}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <label>Fura<select name="truck_id" required defaultValue={defaults.truck_id ?? ""} className={inputClass}><option value="">Pasirinkite furą</option>{trucks.map(t => <option key={t.id} value={t.id}>{t.plate}</option>)}</select></label>
        {[["trip_number", "Reiso nr."], ["origin", "Iš"], ["destination", "Į"], ["trip_date", "Data"]].map(([name, label]) => <label key={name}>{label}<input name={name} type={name === "trip_date" ? "date" : "text"} required defaultValue={defaults[name] ?? ""} className={inputClass} /></label>)}
        {fields.map(([name, label, step]) => <label key={name}>{label}<input name={name} type="number" min={name === "days" ? 1 : 0} max={name === "days" ? 2147483647 : undefined} step={step} required className={inputClass} defaultValue={defaults[name] ?? (name.startsWith("adblue") || name === "empty_km" ? "0" : undefined)} /></label>)}
        <label>Pajamų būdas<select className={inputClass} value={mode} onChange={e => setMode(e.target.value)}><option value="freight">Frachto kaina</option><option value="per_km">Įkainis už apmokamą km</option></select></label>
        <label>{mode === "freight" ? "Frachto kaina (€)" : "Įkainis (€/km)"}<input key={mode} name="revenue" required type={mode === "freight" ? "text" : "number"} inputMode="decimal" min="0" step="0.0001" defaultValue={defaults.revenue ?? ""} className={inputClass} /></label>
      </div>
      <section className="space-y-3"><h2 className="font-semibold">Atkarpos pagal šalis</h2><p className="text-sm text-slate-600">Surašykite visus kilometrus. Neapmokestintiems keliams pasirinkite „Nemokami“.</p>
        {legs.map(leg => <div key={leg.id} className="flex flex-wrap items-end gap-3"><label className="flex-1">Šalis<select required name={`country-${leg.id}`} defaultValue={leg.country} className={inputClass}><option value="">Pasirinkite šalį</option>{tariffs.map(t => <option key={t.country} value={t.country}>{t.country}</option>)}</select></label><label>Atstumas (km)<input name={`km-${leg.id}`} type="number" min="0" step="0.01" required defaultValue={leg.km} className={inputClass} /></label><button type="button" disabled={legs.length === 1} onClick={() => { setLegs(current => current.filter(l => l.id !== leg.id)); setResult(null); setSaved(""); }} className="p-3 underline disabled:opacity-40">Pašalinti</button></div>)}
        <button type="button" className="underline" onClick={() => { setLegs(current => [...current, { id: nextId.current++, country: "", km: "" }]); setResult(null); setSaved(""); }}>Pridėti šalį</button>
      </section>
      <div className="grid gap-4 sm:grid-cols-2">{extras.map(([name, label]) => <label key={name}>{label}<input name={name} type="text" inputMode="decimal" required defaultValue={defaults[name] ?? "0"} className={inputClass} /></label>)}</div>
      <p className="text-sm text-slate-600">Vairuotojo, draudimo, nusidėvėjimo ir priekabos kaštai imami iš pasirinktos furos paros savikainos.</p>
      <div className="flex gap-3"><button type="submit" value="calculate" className="rounded-lg border p-3">Skaičiuoti</button><button type="submit" value="save" disabled={!!saved} className="rounded-lg bg-blue-600 p-3 text-white disabled:opacity-50">{saving ? "Saugoma…" : tripId ? "Išsaugoti pakeitimus" : "Išsaugoti reisą"}</button></div>
    </fieldset>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {saved && <p role="status" className="text-green-800">{saved} <Link href="/trips" className="font-semibold underline">Rodyti reisus</Link></p>}
    {result && <section aria-label="Reiso rezultatai" className="rounded-xl bg-slate-50 p-4"><h2 className="font-semibold">Reiso rezultatai</h2><dl className="mt-3 grid gap-3 sm:grid-cols-2">{[["Kuras", result.fuelCents], ["AdBlue", result.adblueCents], ["Keliai", result.roadCents], ["Fura", result.truckCents], ["Pajamos", result.revenueCents], ["Kaštai iš viso", result.totalCostCents], ["Pelnas", result.profitCents]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="font-semibold">{formatCents(Number(value))}</dd></div>)}<div><dt>Marža</dt><dd>{result.marginPercent === null ? "—" : `${result.marginPercent.toFixed(1)}%`}</dd></div><div><dt>Pelnas už apmokamą km</dt><dd>{result.profitPerKm === null ? "—" : `${result.profitPerKm.toFixed(2)} €/km`}</dd></div></dl></section>}
  </form>;
}
