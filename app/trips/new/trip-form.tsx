"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { getSupabaseClient } from "../../../lib/supabase";
import {
  estimateScandlinesFreightFare,
  SCANDLINES_SURCHARGE_URL,
  SCANDLINES_TARIFF_PERIOD,
  SCANDLINES_TARIFF_URL,
  type FerryFareEstimate,
  type FreightLoad,
} from "../../../lib/ferry-pricing";
import { centsToInput, formatCents, parseEuroToCents } from "../../../lib/money";
import { calculateSavedTrip } from "../../../lib/trip-input";
import { priceForMargin, pricePerKm } from "../../../lib/pricing";
import { truckRowToCalc } from "../../../lib/truck";
import { getTripWithLegs, saveTrip } from "../../../lib/trips";
import { fetchTelematicsFill } from "./telematics";
import { lookupRoute } from "./route-lookup";
import { AddressField } from "./address-field";
import { RouteMap } from "./route-map";
import type { LineCoordinate } from "../../../lib/route-line";
import type { CountryTariff, TripResult } from "../../../lib/calc";
import type { Truck } from "../../../types/truck";
import type { TripInsert, TripWithLegs } from "../../../types/trip";

/**
 * Skaitiniai laukai, suskirstyti pagal skiltis.
 *
 * Grupės surašytos, o ne atrenkamos pagal pavadinimo fragmentą: naujas laukas
 * turi būti sąmoningai priskirtas, o ne nusėsti bet kur pagal atsitiktinį
 * pavadinimo panašumą.
 */
const apimtiesFields = [
  ["days", "Reiso trukmė (paros)", "1"],
  ["paid_km", "Apmokami km", "0.01"],
  ["empty_km", "Tušti km", "0.01"],
] as const;

const kastuFields = [
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

export function TripForm({ tripId, routeLookup = false }: { tripId?: string; routeLookup?: boolean }) {
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
  const [marsrutas, setMarsrutas] = useState("");
  const [skaiciuoja, setSkaiciuoja] = useState(false);
  const [vengtiKeltu, setVengtiKeltu] = useState(false);
  /** `null` reiškia, kad trūkstamos kelto kainos nėra; `[]` – neįvardytas keltas. */
  const [neivertintasKeltas, setNeivertintasKeltas] = useState<string[] | null>(null);
  const [keltoIlgis, setKeltoIlgis] = useState("17");
  const [keltoKrovinys, setKeltoKrovinys] = useState<FreightLoad>("loaded");
  const [keltoIvertis, setKeltoIvertis] = useState<FerryFareEstimate | null>(null);
  const [marsrutoLinija, setMarsrutoLinija] = useState<LineCoordinate[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<TripResult | null>(null);
  /** Apmokami km skaičiavimo metu — reikia įkainiui už km pasiūlyme. */
  const [apmokamiKm, setApmokamiKm] = useState(0);
  /** Norima marža pasiūlymui. Pradinė – tik atspirties taškas, ne norma. */
  const [norimaMarza, setNorimaMarza] = useState("15");
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

  /** Įrašo viešo tarifo įvertį į tą patį lauką, kurį galima pataisyti ranka. */
  function applyFerryEstimate(names: readonly string[], length: string, load: FreightLoad) {
    const estimate = estimateScandlinesFreightFare(names, Number(length), load);
    setKeltoIvertis(estimate);

    const field = formRef.current?.elements.namedItem("ferries_cents");
    if (field instanceof HTMLInputElement) {
      field.value = estimate ? centsToInput(estimate.totalCents) : "";
    }
    setResult(null);
    setSaved("");
    return estimate;
  }

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
      setNeivertintasKeltas(null);
      setKeltoIvertis(null);
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

  /** Užpildo km ir kelių mokesčius iš vilkiko maršruto. Reikšmės taisomos (#61). */
  async function fillFromRoute() {
    const form = formRef.current;
    if (!form || skaiciuoja) return;

    const value = (name: string) => {
      const field = form.elements.namedItem(name);
      return field instanceof HTMLInputElement ? field.value : "";
    };

    setSkaiciuoja(true);
    setMarsrutas("");
    setNeivertintasKeltas(null);
    setKeltoIvertis(null);
    try {
      const result = await lookupRoute(
        value("origin"),
        value("destination"),
        value("origin_point"),
        value("destination_point"),
        vengtiKeltu,
      );
      if (!result.ok) {
        setMarsrutas(result.message);
        setMarsrutoLinija([]);
        return;
      }
      setMarsrutoLinija(result.line);

      for (const [name, filled] of Object.entries(result.fill)) {
        if (name === "legKm") continue;
        const field = form.elements.namedItem(name);
        if (field instanceof HTMLInputElement) field.value = filled;
      }

      const needsFerryPrice = result.ferryDetected && result.ferriesCents === 0;
      setNeivertintasKeltas(needsFerryPrice ? result.ferryNames : null);
      const publicFare = needsFerryPrice
        ? applyFerryEstimate(result.ferryNames, keltoIlgis, keltoKrovinys)
        : null;
      if (!needsFerryPrice) setKeltoIvertis(null);

      // Tikri mokesčiai pakeičia įkainio pagal šalis spėjimą, todėl atkarpa
      // paliekama „Nemokami" – kitaip kaštai būtų suskaičiuoti dukart.
      setLegs([{ id: nextId.current++, country: "Nemokami", km: result.fill.legKm }]);
      setResult(null);
      setSaved("");

      const ispejimai = [
        result.violated ? "PTV nerado vilkikui tinkamo kelio – patikrinkite maršrutą." : "",
        result.approximate ? "Adresas rastas tik iki miesto, tad km apytiksliai." : "",
        needsFerryPrice && publicFare
          ? `Kelto ${publicFare.route} viešo tarifo įvertis ${formatCents(publicFare.totalCents)} įtrauktas (${publicFare.billedMetres} m, ${publicFare.load === "loaded" ? "pakrauta" : "tuščia"}).`
          : "",
        needsFerryPrice && !publicFare
          ? `Keltas aptiktas${result.ferryNames.length ? ` (${result.ferryNames.join(", ")})` : ""}, bet automatinio tarifo nėra — įrašykite kainą lauke „Keltai (€)“.`
          : "",
        result.ferryDetected && result.ferriesCents > 0
          ? `Kelto kaina ${formatCents(result.ferriesCents)} įtraukta.`
          : "",
        result.avoidedFerries && result.ferryDetected
          ? "PTV šio kelto išvengti negalėjo."
          : "",
      ].filter(Boolean).join(" ");

      const shownFerryCents = publicFare?.totalCents ?? result.ferriesCents;
      const shownTollCents = result.bridgesCents + shownFerryCents + result.tunnelsCents;

      setMarsrutas(
        `${result.fromAddress} → ${result.toAddress}: ${Math.round(result.km)} km, `
        + `keliai / tiltai ${formatCents(result.bridgesCents)}, `
        + `keltai ${needsFerryPrice && !publicFare ? "kaina nežinoma" : formatCents(shownFerryCents)}, tuneliai ${formatCents(result.tunnelsCents)}. `
        + `Iš viso ${needsFerryPrice && !publicFare ? "bus aišku įvedus kelto kainą" : formatCents(shownTollCents)}. Siūloma trukmė ${result.days} par. – `
        + `įrašykite patys, jei sutinkate. ${ispejimai}`.trim(),
      );
    } catch {
      setMarsrutas("Nepavyko suskaičiuoti maršruto.");
    } finally {
      setSkaiciuoja(false);
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
      const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
      const truck = trucks.find(t => t.id === text("truck_id"));
      if (!truck) throw new Error("Pasirinkite furą.");
      // Numerio, krypties ir datos skaičiavimas nenaudoja, o kainą dažnai
      // reikia pasitikrinti dar jų neturint. Įrašant reikalavimas lieka (#52).
      if (action === "save") {
        for (const key of ["trip_number", "origin", "destination", "trip_date"]) {
          if (!text(key)) throw new Error("Užpildykite reiso duomenis.");
        }
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
      setApmokamiKm(trip.paid_km);
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
      <Skiltis numeris={1} antraste="Kas ir kur veža">
        <div className="grid gap-4 sm:grid-cols-2">
          <label>Fura<select name="truck_id" required defaultValue={defaults.truck_id ?? ""} className={inputClass}><option value="">Pasirinkite furą</option>{trucks.map(t => <option key={t.id} value={t.id}>{t.plate}</option>)}</select></label>
          <label>Reiso nr.<input name="trip_number" type="text" defaultValue={defaults.trip_number ?? ""} className={inputClass} /></label>
          <AddressField name="origin" label="Iš" defaultValue={defaults.origin ?? ""} enabled={routeLookup} inputClass={inputClass} />
          <AddressField name="destination" label="Į" defaultValue={defaults.destination ?? ""} enabled={routeLookup} inputClass={inputClass} />
        </div>
        {/* Mygtukas šalia laukų, kuriuos jis užpildo, o ne atskiroje dėžutėje viršuje. */}
        {routeLookup && <div className="mt-3">
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" disabled={skaiciuoja} onClick={() => void fillFromRoute()} className="rounded-lg border bg-white p-3 disabled:opacity-50">
              {skaiciuoja ? "Skaičiuojama…" : "Skaičiuoti maršrutą iš adresų"}
            </button>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={vengtiKeltu}
                onChange={(event) => setVengtiKeltu(event.target.checked)}
              />
              Vengti keltų
            </label>
          </div>
          <p className="mt-2 text-sm text-slate-600">Kilometrai ir keliai suskaičiuojami 40 t vilkikui, ne lengvajam.</p>
          {marsrutas && <p role="status" className="mt-2 text-sm text-slate-700">{marsrutas}</p>}
          <RouteMap line={marsrutoLinija} />
        </div>}
      </Skiltis>

      <Skiltis numeris={2} antraste="Kada ir kiek">
        <div className="grid gap-4 sm:grid-cols-2">
          <label>Data<input name="trip_date" type="date" defaultValue={defaults.trip_date ?? ""} className={inputClass} /></label>
          {apimtiesFields.map(([name, label, step]) => <label key={name}>{label}<input name={name} type="number" min={name === "days" ? 1 : 0} max={name === "days" ? 2147483647 : undefined} step={step} required className={inputClass} defaultValue={defaults[name] ?? (name === "empty_km" ? "0" : undefined)} /></label>)}
        </div>
        <p className="mt-2 text-sm text-slate-600">Paros lemia furos kaštus — jie skaičiuojami už kiekvieną parą, net stovint.</p>
      </Skiltis>

      <Skiltis numeris={3} antraste="Kiek išleis">
        <div className="grid gap-4 sm:grid-cols-2">
          {kastuFields.map(([name, label, step]) => <label key={name}>{label}<input name={name} type="number" min="0" step={step} required className={inputClass} defaultValue={defaults[name] ?? (name.startsWith("adblue") ? "0" : undefined)} /></label>)}
          {extras.map(([name, label]) => <label key={name}>{label}<input name={name} type="text" inputMode="decimal" required defaultValue={defaults[name] ?? "0"} className={inputClass} /></label>)}
        </div>
        {neivertintasKeltas !== null && <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <h3 className="font-semibold">Kelto bilieto kaina</h3>
          <p className="mt-1 text-sm text-slate-700">
            PTV aptiko {neivertintasKeltas.length ? neivertintasKeltas.join(", ") : "keltą"}, bet bilieto kainos nepateikė.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label>
              Visas junginio ilgis (m)
              <input
                type="number"
                min="10"
                max="26"
                step="0.1"
                value={keltoIlgis}
                onChange={(event) => {
                  const length = event.target.value;
                  setKeltoIlgis(length);
                  applyFerryEstimate(neivertintasKeltas, length, keltoKrovinys);
                }}
                className={inputClass}
              />
            </label>
            <label>
              Kelte
              <select
                value={keltoKrovinys}
                onChange={(event) => {
                  const load = event.target.value as FreightLoad;
                  setKeltoKrovinys(load);
                  applyFerryEstimate(neivertintasKeltas, keltoIlgis, load);
                }}
                className={inputClass}
              >
                <option value="loaded">Pakrauta</option>
                <option value="empty">Tuščia</option>
              </select>
            </label>
          </div>
          {keltoIvertis ? <p className="mt-3 text-sm text-slate-700">
            Į lauką „Keltai (€)“ įrašyta <strong>{formatCents(keltoIvertis.totalCents)}</strong>:
            bazė {formatCents(keltoIvertis.baseCents)} + BAF/GIR/ETS {formatCents(keltoIvertis.surchargeCents)}.
          </p> : <p role="alert" className="mt-3 text-sm text-red-700">
            Šiam maršrutui arba ilgiui automatinio tarifo nėra. Kelto kainą įrašykite ranka.
          </p>}
          <p className="mt-2 text-xs text-slate-600">
            Scandlines viešo krovininio tarifo įvertis ({SCANDLINES_TARIFF_PERIOD}), be PVM. Sutartinė kaina ir ADR, pločio ar svorio priemokos gali skirtis. {" "}
            <a href={SCANDLINES_TARIFF_URL} target="_blank" rel="noreferrer" className="underline">Bazinis tarifas</a>{" · "}
            <a href={SCANDLINES_SURCHARGE_URL} target="_blank" rel="noreferrer" className="underline">Priemokos</a>
          </p>
        </div>}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">Nuo<input name="tele_from" type="date" className={inputClass} /></label>
          <label className="text-sm">Iki<input name="tele_to" type="date" className={inputClass} /></label>
          <button type="button" disabled={pildoma} onClick={() => void fillFromTelematics()} className="rounded-lg border bg-white p-3 disabled:opacity-50">
            {pildoma ? "Imama…" : "Užpildyti iš telematikos"}
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-600">Paims tikrus tos furos km, kurą ir sumokėtus kelius per nurodytą laikotarpį.</p>
        {telematika && <p role="status" className="mt-2 text-sm text-slate-700">{telematika}</p>}
        <p className="mt-3 text-sm text-slate-600">Vairuotojo, draudimo, nusidėvėjimo ir priekabos kaštai imami iš furos paros savikainos — atskirai vesti nereikia.</p>
      </Skiltis>

      <Skiltis numeris={4} antraste="Kiek gaus">
        <div className="grid gap-4 sm:grid-cols-2">
          <label>Pajamų būdas<select className={inputClass} value={mode} onChange={e => setMode(e.target.value)}><option value="freight">Frachto kaina</option><option value="per_km">Įkainis už apmokamą km</option></select></label>
          <label>{mode === "freight" ? "Frachto kaina (€)" : "Įkainis (€/km)"}<input key={mode} name="revenue" required type={mode === "freight" ? "text" : "number"} inputMode="decimal" min="0" step="0.0001" defaultValue={defaults.revenue ?? ""} className={inputClass} /></label>
        </div>
      </Skiltis>

      {/* Atkarpos reikalingos tik tada, kai kelių kaina skaičiuojama pagal
          įkainius. Su PTV ar telematika ten lieka viena „Nemokami" eilutė,
          todėl skiltis suskleista ir nebeblaško. */}
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer font-semibold">Atkarpos pagal šalis</summary>
        <p className="mt-2 text-sm text-slate-600">Reikalinga tik tada, kai kelių kaina skaičiuojama pagal šalių įkainius. Suvedus tikrus mokesčius, čia lieka viena „Nemokami“ eilutė su visais kilometrais.</p>
        <div className="mt-3 space-y-3">
          {legs.map(leg => <div key={leg.id} className="flex flex-wrap items-end gap-3"><label className="flex-1">Šalis<select required name={`country-${leg.id}`} defaultValue={leg.country} className={inputClass}><option value="">Pasirinkite šalį</option>{tariffs.map(t => <option key={t.country} value={t.country}>{t.country}</option>)}</select></label><label>Atstumas (km)<input name={`km-${leg.id}`} type="number" min="0" step="0.01" required defaultValue={leg.km} className={inputClass} /></label><button type="button" disabled={legs.length === 1} onClick={() => { setLegs(current => current.filter(l => l.id !== leg.id)); setResult(null); setSaved(""); }} className="p-3 underline disabled:opacity-40">Pašalinti</button></div>)}
          <button type="button" className="underline" onClick={() => { setLegs(current => [...current, { id: nextId.current++, country: "", km: "" }]); setResult(null); setSaved(""); }}>Pridėti šalį</button>
        </div>
      </details>

      <div className="flex gap-3"><button type="submit" value="calculate" className="rounded-lg border p-3">Skaičiuoti</button><button type="submit" value="save" disabled={!!saved} className="rounded-lg bg-blue-600 p-3 text-white disabled:opacity-50">{saving ? "Saugoma…" : tripId ? "Išsaugoti pakeitimus" : "Išsaugoti reisą"}</button></div>

      {error && <p role="alert" className="text-red-700">{error}</p>}
      {saved && <p role="status" className="text-green-800">{saved} <Link href="/trips" className="font-semibold underline">Rodyti reisus</Link></p>}

      {/* Rezultatas iškart po mygtukais: anksčiau jis būdavo už jų, ir
          paspaudus „Skaičiuoti" tekdavo slinkti žemyn pažiūrėti, kas išėjo. */}
      {result && <section aria-label="Reiso rezultatai" className="rounded-xl border-2 border-slate-300 bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-semibold">Reiso rezultatai</h2>
          <p className={`text-2xl font-bold ${result.profitCents >= 0 ? "text-green-700" : "text-red-700"}`}>
            {formatCents(result.profitCents)} {result.profitCents >= 0 ? "pelnas" : "nuostolis"}
          </p>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Marža {result.marginPercent === null ? "—" : `${result.marginPercent.toFixed(1)}%`}
          {" · "}
          {result.profitPerKm === null ? "—" : `${result.profitPerKm.toFixed(2)} €/km`}
        </p>
        <dl className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-3">
          {[["Kuras", result.fuelCents], ["AdBlue", result.adblueCents], ["Keliai", result.roadCents], ["Fura", result.truckCents], ["Kaštai iš viso", result.totalCostCents], ["Pajamos", result.revenueCents]].map(([label, value]) => <div key={label}><dt className="text-sm text-slate-500">{label}</dt><dd className="font-semibold tabular-nums">{formatCents(Number(value))}</dd></div>)}
        </dl>

        {/* Atvirkštinis klausimas: kaštai žinomi, reikia kainos. Būtent jo
            reikia kalbant su užsakovu, o ne ką tik suvestos kainos pelno. */}
        <div className="mt-4 border-t pt-4">
          <h3 className="font-semibold">Kiek prašyti</h3>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              Norima marža (%)
              <input
                type="number"
                step="0.5"
                value={norimaMarza}
                onChange={(event) => setNorimaMarza(event.target.value)}
                className={`${inputClass} w-32`}
              />
            </label>
            {(() => {
              const kaina = priceForMargin(result.totalCostCents, Number(norimaMarza));
              if (kaina === null) {
                return <p className="text-sm text-slate-600">Tokia marža nepasiekiama — 100 % reikštų pajamas be kaštų.</p>;
              }
              const uzKm = pricePerKm(kaina, apmokamiKm);
              return (
                <p className="text-lg font-semibold tabular-nums">
                  {formatCents(kaina)}
                  {uzKm !== null && <span className="ml-2 text-sm font-normal text-slate-600">({uzKm.toFixed(2)} €/km)</span>}
                </p>
              );
            })()}
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Marža skaičiuojama nuo sąskaitos sumos, ne nuo kaštų: 20 % prie 800 € kaštų yra 1 000 €, ne 960 €.
          </p>
        </div>
      </section>}
    </fieldset>
  </form>;
}

/** Sunumeruota skiltis: vartotojas mato, kiek žingsnių liko. */
function Skiltis({ numeris, antraste, children }: { numeris: number; antraste: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-4">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-sm">{numeris}</span>
        {antraste}
      </h2>
      {children}
    </section>
  );
}
