"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
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
import { copiedTruckIds } from "../../../lib/truck-costs-bulk";
import { getTripWithLegs, listTrips, saveTrip, type TripSummary } from "../../../lib/trips";
import { copyForNewTrip, tripDefaults } from "../../../lib/trip-copy";
import { routeHistory, type RouteHistory } from "../../../lib/route-history";
import { emptyKmByTruck } from "../../../lib/empty-km";
import { defaultEmptyKm, pickDays, quoteNotes, type DaysSource } from "../../../lib/quick-quote";
import { fetchTelematicsFill } from "./telematics";
import { rateFill } from "@/lib/telematics-costs";
import {
  lookupRouteOptions,
  lookupSchedule,
  type RouteOptionResult,
} from "./route-lookup";
import {
  DRIVER_SCENARIOS,
  type DriverScenario,
  type RouteSchedule,
} from "../../../lib/ptv-schedule";
import { AddressField } from "./address-field";
import { RouteMap, type MapStop } from "./route-map";
import { RouteClient } from "./route-client";
import { StopsEditor } from "./stops-editor";
import { TripDurationPanel } from "./trip-duration-panel";
import type { LineCoordinate } from "../../../lib/route-line";
import type { RouteViolation } from "../../../lib/ptv-route";
import type { RouteEmissions } from "../../../lib/ptv-emissions";
import {
  STOP_TYPE_LABELS,
  addStop,
  buildWaypoints,
  moveStop,
  removeStop,
  routedStops,
  stopLetter,
  stopsFromStored,
  toStoredStops,
  updateStop,
  type Stop,
  type StopType,
} from "../../../lib/stops";
import {
  addViaPoint,
  legIndex,
  moveViaPoint,
  orderViaPoints,
  removeViaPoint,
  type ViaPoint,
} from "../../../lib/via-points";
import type { CountryTariff, TripResult } from "../../../lib/calc";
import type { Truck } from "../../../types/truck";
import type { TripInsert } from "../../../types/trip";

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
const inputClass = "mt-1 block w-full rounded-lg border border-line bg-surface p-3";

/** Naršyklės vietinę datą ir laiką paverčia nedviprasmišku UTC laiku PTV. */
function departureIso(date: string, time: string): string | undefined {
  if (!date) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || !clock) return undefined;

  const departure = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(clock[1]),
    Number(clock[2]),
  );
  return Number.isNaN(departure.getTime()) ? undefined : departure.toISOString();
}

function durationText(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours} val. ${rest} min.` : `${rest} min.`;
}

/** Paskutinių 30 dienų rėžis. Už komponento ribų, nes render metu laiko imti negalima. */
function paskutinesTrisdesimtDienu(): { from: string; to: string } {
  const isoDate = (at: number) => new Date(at).toISOString().slice(0, 10);
  const dabar = Date.now();
  return { from: isoDate(dabar - 30 * 86_400_000), to: isoDate(dabar) };
}

/** Ką maršruto paieška grąžina greitai kainai: pati forma jau užpildyta. */
interface RouteOutcome {
  routeDays: number;
  paidKm: number;
  ferryUnknown: boolean;
  approximate: boolean;
}

export function TripForm({
  tripId,
  copyFromId,
  routeLookup = false,
}: {
  tripId?: string;
  /** Reisas, iš kurio kopijuojama į naują (#129). */
  copyFromId?: string;
  routeLookup?: boolean;
}) {
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
  const [normos, setNormos] = useState("");
  const [marsrutas, setMarsrutas] = useState("");
  const [skaiciuoja, setSkaiciuoja] = useState(false);
  const [vengtiKeltu, setVengtiKeltu] = useState(false);
  /** `null` reiškia, kad trūkstamos kelto kainos nėra; `[]` – neįvardytas keltas. */
  const [neivertintasKeltas, setNeivertintasKeltas] = useState<string[] | null>(null);
  const [keltoIlgis, setKeltoIlgis] = useState("17");
  const [keltoKrovinys, setKeltoKrovinys] = useState<FreightLoad>("loaded");
  const [keltoIvertis, setKeltoIvertis] = useState<FerryFareEstimate | null>(null);
  const [marsrutoLinija, setMarsrutoLinija] = useState<LineCoordinate[]>([]);
  const [marsrutoPazeidimai, setMarsrutoPazeidimai] = useState<RouteViolation[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<TripResult | null>(null);
  /** Apmokami km skaičiavimo metu — reikia įkainiui už km pasiūlyme. */
  const [apmokamiKm, setApmokamiKm] = useState(0);
  /** Norima marža pasiūlymui. Pradinė – tik atspirties taškas, ne norma. */
  const [norimaMarza, setNorimaMarza] = useState("15");
  /** Anksčiau išsaugoti reisai – kainos istorijai (#109). */
  const [ankstesni, setAnkstesni] = useState<TripSummary[]>([]);
  const [istorija, setIstorija] = useState<RouteHistory | null>(null);
  /** Furos numeris, kai jos paros savikaina atrodo nukopijuota (#111). */
  const [nepatikslinta, setNepatikslinta] = useState<string | null>(null);
  /** Krovinio svoris tonomis – tik PTV užklausai, reise nesaugomas (#86). */
  const [krovinioSvoris, setKrovinioSvoris] = useState("");
  const [emisijos, setEmisijos] = useState<RouteEmissions | null>(null);
  const [emisijuSvoriai, setEmisijuSvoriai] = useState(false);
  /** Vairavimo laiko planas: pertraukos, poilsis ir teisėtas atvykimas (#87). */
  const [tvarkarastis, setTvarkarastis] = useState<RouteSchedule | null>(null);
  const [tvarkarascioKlaida, setTvarkarascioKlaida] = useState("");
  const [planuoja, setPlanuoja] = useState(false);
  const [scenarijus, setScenarijus] = useState<DriverScenario>("multipleDays");
  const [jauVairavo, setJauVairavo] = useState("0");
  /** Maršruto variantai su kaštais (#84). */
  const [variantai, setVariantai] = useState<RouteOptionResult[]>([]);
  const [variantuKlaida, setVariantuKlaida] = useState("");
  const [lyginama, setLyginama] = useState(false);
  const [pasirinktas, setPasirinktas] = useState<string | null>(null);
  /** Tarpiniai taškai, per kuriuos vedamas maršrutas (#85). */
  const [tarpiniai, setTarpiniai] = useState<ViaPoint[]>([]);
  /** Paskutinio maršruto km ir išvykimas (`YYYY-MM-DDTHH:MM`) – reiso trukmės įverčiui. */
  const [marsrutoTrukmei, setMarsrutoTrukmei] = useState<{ km: number; departure?: string } | null>(null);
  /**
   * Sustojimai – vienintelis šaltinis: formos laukai „Iš“ / „Į“, papildomi
   * sustojimai ir padidinto žemėlapio šoninis skydelis skaito ir keičia šį sąrašą.
   */
  const [stops, setStops] = useState<Stop[]>([
    { id: 0, type: "loading", address: "", point: "" },
    { id: 1, type: "unloading", address: "", point: "" },
  ]);
  const nextStopId = useRef(2);
  /** Sustojimų vietos, kurias PTV panaudojo paskutiniame maršrute – žymekliams. */
  const [marsrutoSustojimai, setMarsrutoSustojimai] = useState<MapStop[]>([]);
  /** Paskutinio maršruto suvestinė – rodoma čia pat, reiso bloke. */
  const [santrauka, setSantrauka] = useState<{ km: number; travelMinutes: number; days: number; tollCents: number; delayMinutes: number } | null>(null);
  /** Tempimas baigiasi dažnai, o PTV užklausa kainuoja – laukiame, kol žmogus nustos. */
  const routeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /**
   * Nauja užklausa nutraukia ankstesnę, o atsakymai atpažįstami pagal numerį:
   * pavėlavęs atsakymas į senesnį tašką niekada neperrašo naujesnio.
   */
  const [routeClient] = useState(() => new RouteClient());
  const routeRun = useRef(0);
  /** Palyginimas rodomas ir atnaujinamas pats, kol žmogus jo neišjungė. */
  const [rodytiVariantus, setRodytiVariantus] = useState(false);
  const rodytiVariantusRef = useRef(false);
  /** PTV vairavimo laiko planas jau parodytas – tada jis atnaujinamas kartu su maršrutu. */
  const planasParodytas = useRef(false);
  const [saved, setSaved] = useState("");
  const [attempt, setAttempt] = useState(0);
  /**
   * Greita kaina (#157). Visa, ko čia nėra, guli skiltyje „Pakeisti ranka“.
   * Be PTV rakto ir taisant išsaugotą reisą ji atvira iškart: ten laukus
   * pildo žmogus, o ne mygtukas.
   */
  const [detaliai, setDetaliai] = useState(!routeLookup || Boolean(tripId));
  const [kainaSkaiciuojama, setKainaSkaiciuojama] = useState(false);
  const [pastabos, setPastabos] = useState<string[]>([]);
  /** Iš ko paimtos paros ir ar po to keistas maršrutas. `null` – rašė žmogus. */
  const [dienuSaltinis, setDienuSaltinis] = useState<{ source: DaysSource; stale: boolean } | null>(null);
  /** Rezultatas skaičiuotas be pajamų: antraštė – kiek prašyti, ne pelnas. */
  const [bePajamu, setBePajamu] = useState(false);
  /** Pradėtas furos normų pildymas; greita kaina jo laukia, kad neperrašytų. */
  const normuPildymas = useRef<Promise<void>>(Promise.resolve());
  const skaiciuotiMygtukas = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const client = getSupabaseClient();
        const source = tripId ?? copyFromId;
        const [t, c, existing] = await Promise.all([
          client.from("trucks").select("*").order("plate"),
          client.from("country_tariffs").select("country,rate,rate_type").order("country"),
          source ? getTripWithLegs(source) : null,
        ]);
        if (t.error) throw t.error;
        if (c.error) throw c.error;
        if (!cancelled) {
          setTrucks(t.data as Truck[]);
          setTariffs(c.data.map(row => ({ country: row.country, rate: Number(row.rate), rateType: row.rate_type })));
          if (existing) {
            // Kopijuojant numeris ir data neperkeliami: numeris turi būti
            // naujas, o sena data priskirtų reisą ne tam mėnesiui (#129).
            const copy = tripId
              ? { defaults: tripDefaults(existing), legs: existing.legs.map((leg) => ({ country: leg.country, km: String(leg.km) })), revenueMode: existing.revenue_mode }
              : copyForNewTrip(existing, new Date().toISOString().slice(0, 10));

            setDefaults(copy.defaults);
            const loadedStops = stopsFromStored(existing.stops, copy.defaults.origin ?? "", copy.defaults.destination ?? "");
            setStops(loadedStops);
            nextStopId.current = loadedStops.length;
            setMode(copy.revenueMode);
            if (copy.legs.length) {
              setLegs(copy.legs.map((leg, index) => ({ id: index, ...leg })));
              nextId.current = copy.legs.length;
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
  }, [attempt, tripId, copyFromId]);

  // Istorija kraunama atskirai ir formos nesulaiko: be jos skaičiuoklė veikia
  // kaip anksčiau, o laukti dėl patarimo nereikėtų (#109).
  useEffect(() => {
    let cancelled = false;
    listTrips()
      .then((loaded) => { if (!cancelled) setAnkstesni(loaded); })
      .catch(() => { /* Patarimas yra priedas – be jo forma lieka pilnavertė. */ });
    return () => { cancelled = true; };
  }, [attempt]);

  /**
   * Tarpinis taškas keičia maršrutą, bet ne vairavimo laiko planą: paros, įrašytos
   * greitos kainos, nebeatitinka kelio, kol kaina neperskaičiuota.
   */
  function markDaysStale() {
    setDienuSaltinis((current) => current && { ...current, stale: true });
  }

  /** Perskaičiuoja maršrutą, kai žmogus nustoja tempti ar redaguoti. */
  function scheduleRoute(via: ViaPoint[], stopList: Stop[], delay = 150) {
    clearTimeout(routeTimer.current);
    routeTimer.current = setTimeout(() => void fillFromRoute(via, !tripId, stopList), delay);
  }

  useEffect(() => () => {
    clearTimeout(routeTimer.current);
    routeClient.cancel();
  }, [routeClient]);

  /**
   * Taškai išrikiuojami pagal ruožą ir liniją prieš užklausą: PTV veda per juos
   * ta tvarka, kuria surašyti, tad netvarkingi taškai versų maršrutą grįžti atgal.
   */
  function changeVia(points: ViaPoint[]) {
    const ordered = orderViaPoints(points, marsrutoLinija);
    setTarpiniai(ordered);
    markDaysStale();
    scheduleRoute(ordered, stops);
  }

  /** Žemėlapio veiksmai: pridėti, perkelti ir pašalinti tarpinį tašką (#85). */
  function addVia(point: ViaPoint): boolean {
    const located = { ...point, leg: legIndex(marsrutoLinija, marsrutoSustojimai, point) };
    const change = addViaPoint(tarpiniai, located);
    if (!change.ok) {
      setMarsrutas(change.message);
      return false;
    }
    changeVia(change.points);
    return true;
  }

  function moveVia(index: number, point: ViaPoint) {
    changeVia(moveViaPoint(tarpiniai, index, { ...point, leg: legIndex(marsrutoLinija, marsrutoSustojimai, point) }));
  }

  function removeVia(index: number) {
    changeVia(removeViaPoint(tarpiniai, index));
  }

  /**
   * Sustojimų sąrašo pakeitimas. Eilės ir sudėties keitimas nuima tarpinius
   * taškus: jie priklauso konkrečiam ruožui tarp dviejų sustojimų. Perskaičiuojama
   * tik jei maršrutas jau buvo suskaičiuotas.
   */
  function changeStops(next: Stop[], { resetVia, recalc }: { resetVia: boolean; recalc: boolean }) {
    setStops(next);
    setResult(null);
    setSaved("");
    markDaysStale();

    const via = resetVia ? [] : tarpiniai;
    if (resetVia && tarpiniai.length > 0) {
      setTarpiniai([]);
      setMarsrutas("Tarpiniai taškai nuimti, nes pasikeitė sustojimai.");
    }
    if (recalc && marsrutoLinija.length > 0) scheduleRoute(via, next, 600);
  }

  /** Rašant adresą maršrutas neperskaičiuojamas – tik pasirinkus pasiūlymą. */
  function updateStopAt(index: number, change: Partial<Pick<Stop, "type" | "address" | "point">>) {
    changeStops(updateStop(stops, index, change), { resetVia: false, recalc: Boolean(change.point) });
  }

  function addStopOfType(type: StopType) {
    changeStops(addStop(stops, nextStopId.current++, type), { resetVia: true, recalc: false });
  }

  function removeStopAt(index: number) {
    const removed = stops[index];
    changeStops(removeStop(stops, index), { resetVia: true, recalc: Boolean(removed?.address.trim() || removed?.point) });
  }

  function moveStopAt(index: number, delta: -1 | 1) {
    changeStops(moveStop(stops, index, delta), { resetVia: true, recalc: true });
  }

  const stopsEditor = (includeEnds: boolean) => <StopsEditor
    stops={stops}
    includeEnds={includeEnds}
    enabled={routeLookup}
    inputClass={inputClass}
    onUpdate={updateStopAt}
    onAdd={addStopOfType}
    onRemove={removeStopAt}
    onMove={moveStopAt}
  />;

  /**
   * Keli PTV keliai su kaštais (#84).
   *
   * Kuro norma ir kaina imamos iš formos: be jų liktų vien mokesčiai, o
   * trumpesnis kelias dažnai laimi būtent kuru.
   */
  async function compareRoutes() {
    const form = formRef.current;
    if (!form || lyginama) return;

    const value = (name: string) => {
      const field = form.elements.namedItem(name);
      return field instanceof HTMLInputElement ? field.value : "";
    };

    setLyginama(true);
    setVariantuKlaida("");
    setPasirinktas(null);
    try {
      const result = await lookupRouteOptions(
        value("origin"),
        value("destination"),
        value("origin_point"),
        value("destination_point"),
        vengtiKeltu,
        departureIso(value("trip_date"), value("departure_time")),
        {
          litresPer100Km: Number(value("fuel_l_per_100km").replace(",", ".")) || 0,
          priceCentsPerLitre: parseEuroToCents(value("fuel_price")) ?? 0,
        },
      );

      if (!result.ok) {
        setVariantuKlaida(result.message);
        return;
      }
      setVariantai(result.options);
    } catch {
      setVariantuKlaida("Nepavyko palyginti maršruto variantų.");
    } finally {
      setLyginama(false);
    }
  }

  /** Pasirinktas variantas užpildo formą ir žemėlapį – kiti tik rodomi. */
  function applyRouteOption(option: RouteOptionResult) {
    const form = formRef.current;
    if (!form) return;

    for (const [name, filled] of Object.entries(option.fill)) {
      if (name === "legKm") continue;
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement) field.value = filled;
    }

    setLegs([{ id: nextId.current++, country: "Nemokami", km: option.fill.legKm }]);
    setMarsrutoLinija(option.line);
    setMarsrutoPazeidimai(option.violations);
    setNeivertintasKeltas(option.ferryPriceUnknown ? option.ferryNames : null);
    setPasirinktas(option.routeId ?? "pagrindinis");
    setResult(null);
    setSaved("");
  }

  /**
   * Vairuotojo pertraukos ir teisėtas atvykimas (#87).
   *
   * Atskiras mygtukas: PTV tvarkaraštis eina per POST ir yra dar viena
   * užklausa, o kilometrai bei mokesčiai reikalingi kur kas dažniau.
   */
  async function planDriverHours(): Promise<number | null> {
    const form = formRef.current;
    if (!form || planuoja) return null;

    const value = (name: string) => {
      const field = form.elements.namedItem(name);
      return field instanceof HTMLInputElement ? field.value : "";
    };

    setPlanuoja(true);
    setTvarkarascioKlaida("");
    setTvarkarastis(null);
    try {
      const departure = departureIso(value("trip_date"), value("departure_time"));
      if (!departure) {
        setTvarkarascioKlaida("Įveskite reiso datą ir išvykimo laiką.");
        return null;
      }

      const result = await lookupSchedule(
        value("origin"),
        value("destination"),
        value("origin_point"),
        value("destination_point"),
        departure,
        scenarijus,
        Number(jauVairavo.replace(",", ".")) || 0,
      );

      if (!result.ok) {
        setTvarkarascioKlaida(result.message);
        return null;
      }
      setTvarkarastis(result.schedule);
      planasParodytas.current = true;
      return result.schedule.days;
    } catch {
      setTvarkarascioKlaida("Nepavyko suplanuoti vairavimo laiko.");
      return null;
    } finally {
      setPlanuoja(false);
    }
  }

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

  /**
   * Pasirinkus furą pasiūlo jos kuro ir AdBlue normas (#151).
   *
   * Imamos paskutinės 30 dienų: norma ir kaina yra furos savybė, kuri keičiasi
   * lėtai, tad jų nereikia vesti ranka kiekvienam reisui. Kilometrai, paros ir
   * keliai neliečiami — juos spėti pagal praeitą mėnesį būtų prasimanymas.
   *
   * Taisant išsaugotą reisą nedaroma nieko: ten įrašyta tai, kas buvo tada.
   */
  async function prefillRates(truckId: string) {
    const form = formRef.current;
    if (!form || tripId) return;

    const plate = trucks.find((truck) => truck.id === truckId)?.plate ?? "";
    if (!plate) {
      setNormos("");
      return;
    }

    const { from, to } = paskutinesTrisdesimtDienu();

    try {
      const result = await fetchTelematicsFill(plate, from, to);
      // Tai patogumas, ne reikalavimas: neradus duomenų laukai lieka tušti.
      if (!result.ok) {
        setNormos("");
        return;
      }

      const rates = Object.entries(rateFill(result.fill));
      for (const [name, filled] of rates) {
        const field = form.elements.namedItem(name);
        if (field instanceof HTMLInputElement) field.value = filled;
      }

      setNormos(
        rates.length > 0
          ? `Kuro ir AdBlue normos – ${plate} paskutinių 30 d. faktas. Galite taisyti.`
          : "",
      );
      setResult(null);
    } catch {
      setNormos("");
    }
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

  /**
   * Užpildo km ir kelių mokesčius iš vilkiko maršruto. Reikšmės taisomos (#61).
   *
   * `write = false` – išsaugoto reiso redagavimas: rodoma, ką PTV siūlo, bet
   * laukai nekeičiami, nes ten įrašyta tai, kas buvo tada.
   *
   * Kviečiama ir tempiant: nauja užklausa nutraukia ankstesnę, todėl jokių eilių
   * nėra – skaičiuojamas tik naujausias taškų sąrašas, o `null` reiškia, kad šią
   * užklausą aplenkė kita.
   */
  async function fillFromRoute(via: ViaPoint[] = tarpiniai, write = true, stopList: Stop[] = stops): Promise<RouteOutcome | null> {
    const form = formRef.current;
    if (!form) return null;

    const value = (name: string) => {
      const field = form.elements.namedItem(name);
      return field instanceof HTMLInputElement ? field.value : "";
    };

    const run = ++routeRun.current;
    setSkaiciuoja(true);
    setMarsrutas("");
    // Linijos čia nevalom: žemėlapis lieka gyvas, o sena linija matoma, kol ateis
    // nauja. Ji pakeičiama gavus rezultatą arba ištrinama klaidos atveju.
    try {
      const tripDate = value("trip_date");
      const departureTime = value("departure_time");
      if (tripDate && !departureTime) {
        setMarsrutas("Įveskite išvykimo laiką.");
        setMarsrutoLinija([]);
        return null;
      }

      // Svoriai keičia PTV kuro įvertį trečdaliu, todėl siunčiami kartu:
      // furos — iš duomenų bazės, krovinio — iš šio reiso lauko (#86).
      const selected = trucks.find((truck) => truck.id === value("truck_id"));
      const loadTonnes = Number(krovinioSvoris.replace(",", "."));

      const routed = routedStops(stopList);
      const outcome = await routeClient.lookup({
        waypoints: buildWaypoints(stopList, via),
        avoidFerries: vengtiKeltu,
        departureAt: departureIso(tripDate, departureTime),
        weights: {
          emptyWeightKg: selected?.empty_weight_kg ?? null,
          totalPermittedWeightKg: selected?.total_permitted_weight_kg ?? null,
          loadWeightKg: Number.isFinite(loadTonnes) && loadTonnes > 0 ? loadTonnes * 1000 : null,
        },
      });
      // Aplenkta naujesnės užklausos: jos rezultatas rodomas, šios – ne.
      if (!outcome || run !== routeRun.current) return null;

      const { result } = outcome;
      if (!result.ok) {
        setMarsrutas(result.message);
        // Su tarpiniais taškais paskutinis galiojantis maršrutas paliekamas
        // ekrane: kitaip nepavykęs paspaudimas nutrintų ir tai, kas veikė (#85).
        if (via.length === 0) {
          setMarsrutoLinija([]);
          setMarsrutoSustojimai([]);
          setSantrauka(null);
        }
        return null;
      }

      setTarpiniai(orderViaPoints(via, result.line));
      setMarsrutoLinija(result.line);
      setMarsrutoSustojimai(result.places.map((place, index) => {
        const stop = routed[index];
        return {
          latitude: place.latitude,
          longitude: place.longitude,
          letter: stopLetter(stopList.indexOf(stop)),
          title: `${STOP_TYPE_LABELS[stop.type]}: ${place.label || stop.address}`,
        };
      }));
      setSantrauka({
        km: result.km,
        travelMinutes: result.travelMinutes,
        days: result.days,
        tollCents: result.tollCents,
        delayMinutes: result.trafficDelayMinutes,
      });
      setMarsrutoTrukmei({
        km: result.km,
        departure: tripDate && /^\d{2}:\d{2}$/.test(departureTime) ? `${tripDate}T${departureTime}` : undefined,
      });
      setMarsrutoPazeidimai(result.violations);
      setEmisijos(result.emissions);
      setEmisijuSvoriai(result.weightsUsed);
      setKeltoIvertis(null);

      if (write) {
        for (const [name, filled] of Object.entries(result.fill)) {
          if (name === "legKm") continue;
          const field = form.elements.namedItem(name);
          if (field instanceof HTMLInputElement) field.value = filled;
        }
      }

      const needsFerryPrice = result.ferryDetected && result.ferriesCents === 0;
      setNeivertintasKeltas(needsFerryPrice ? result.ferryNames : null);
      // Redaguojant tarifas tik paskaičiuojamas, bet į lauką neįrašomas.
      const publicFare = !needsFerryPrice
        ? null
        : write
          ? applyFerryEstimate(result.ferryNames, keltoIlgis, keltoKrovinys)
          : estimateScandlinesFreightFare(result.ferryNames, Number(keltoIlgis), keltoKrovinys);
      if (!needsFerryPrice) setKeltoIvertis(null);

      if (write) {
        // Tikri mokesčiai pakeičia įkainio pagal šalis spėjimą, todėl atkarpa
        // paliekama „Nemokami" – kitaip kaštai būtų suskaičiuoti dukart.
        setLegs([{ id: nextId.current++, country: "Nemokami", km: result.fill.legKm }]);
        setResult(null);
        setSaved("");
      }

      const ispejimai = [
        result.violated && result.violations.length === 0 ? "PTV nerado vilkikui tinkamo kelio – patikrinkite maršrutą." : "",
        result.approximate ? "Adresas rastas tik iki miesto, tad km apytiksliai." : "",
        // Viešo kelto tarifo įvertis rodomas kelto skiltyje žemiau — čia jo
        // nekartojame (#159).
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

      // Viena trumpa eilutė (#159): kelio suskaidymas į tiltus, keltus ir
      // tunelius matomas laukuose skiltyje „Pakeisti ranka“, o paros jau
      // įrašytos pačios ir jų šaltinis parašytas prie lauko.
      setMarsrutas(
        `${result.fromAddress} → ${result.toAddress}: ${Math.round(result.km).toLocaleString("lt-LT")} km, `
        + `keliai ${needsFerryPrice && !publicFare ? "— kelto kaina nežinoma" : formatCents(shownTollCents)}. `
        + ispejimai,
      );

      // Palyginimas atnaujinamas pats: pasikeitęs maršrutas – pasikeitę variantai.
      if (rodytiVariantusRef.current) void compareRoutes();
      if (planasParodytas.current && tripDate && departureTime) void planDriverHours();

      return {
        routeDays: result.days,
        paidKm: Number(result.fill.paid_km),
        ferryUnknown: needsFerryPrice && !publicFare,
        approximate: result.approximate,
      };
    } catch {
      if (run === routeRun.current) setMarsrutas("Nepavyko suskaičiuoti maršruto.");
      return null;
    } finally {
      if (run === routeRun.current) setSkaiciuoja(false);
    }
  }

  /**
   * Greita kaina (#157): vienas mygtukas vietoj trijų.
   *
   * Maršrutas ir vairavimo laiko planas skaičiuojami kartu ir vienas kito
   * nestabdo: jei vienas nepavyksta, žmogus mato jo klaidą, o kitas vis tiek
   * naudojamas. Laukus užpildo tie patys įrašymai kaip ir rankiniu keliu, o
   * paskui vykdomas įprastas „Skaičiuoti“ – be pajamų, todėl rezultato
   * antraštė yra kaina, kurios prašyti.
   */
  async function calculateQuote() {
    const form = formRef.current;
    if (!form || kainaSkaiciuojama) return;

    setKainaSkaiciuojama(true);
    setPastabos([]);
    setError("");
    try {
      // Tik ką pasirinktos furos normas kraunasi fone; jų nelaukus, vėliau
      // atėjusios jos perrašytų jau suskaičiuotą kainą.
      await normuPildymas.current;

      // Išsaugoto reiso laukai nekeičiami (#151 taisyklė): ten yra tai, kas buvo tada.
      const write = !tripId;
      const [route, scheduleDays] = await Promise.all([fillFromRoute(tarpiniai, write, stops), planDriverHours()]);

      const picked = pickDays(scheduleDays, route?.routeDays ?? null);
      const truckId = form.elements.namedItem("truck_id");
      const plate = trucks.find((truck) => truck.id === (truckId instanceof HTMLSelectElement ? truckId.value : ""))?.plate;
      const emptyShare = emptyKmByTruck(ankstesni).find((row) => row.plate === plate)?.emptyShare ?? null;
      const emptyKm = route ? defaultEmptyKm(route.paidKm, emptyShare) : 0;

      if (write) {
        const days = form.elements.namedItem("days");
        if (days instanceof HTMLInputElement && picked.days !== null) days.value = String(picked.days);
        setDienuSaltinis(picked.days !== null ? { source: picked.source, stale: false } : null);

        if (route) {
          const empty = form.elements.namedItem("empty_km");
          if (empty instanceof HTMLInputElement) empty.value = String(emptyKm);
          // Atkarpų suma privalo sutapti su apmokamais ir tuščiais km, o tuščių
          // dabar yra. `flushSync`, nes skaičiavimas skaito DOM iškart po to.
          flushSync(() => {
            setLegs([{ id: nextId.current++, country: "Nemokami", km: String(Math.round((route.paidKm + emptyKm) * 100) / 100) }]);
          });
        }
      }

      setPastabos(quoteNotes({
        applied: write,
        routeOk: route !== null,
        scheduleOk: scheduleDays !== null,
        days: picked.days,
        daysSource: picked.source,
        emptyKm,
        emptyShare,
        ferryUnknown: route?.ferryUnknown ?? false,
        approximateAddress: route?.approximate ?? false,
      }));

      // Įprastas skaičiavimas su visomis patikromis; trūkstamą lauką parodys
      // ir atvers „Pakeisti ranka“.
      form.requestSubmit(skaiciuotiMygtukas.current);
    } finally {
      setKainaSkaiciuojama(false);
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
      // Greitai kainai pajamų dar nėra – jos yra tai, ko ieškoma. Išsaugoti
      // reiso be jų negalima: 0 € pajamų įrašytų neegzistuojantį nuostolį.
      const hasRevenue = text("revenue") !== "";
      if (action === "save" && !hasRevenue) throw new Error("Išsaugoti galima tik įrašius pajamas.");
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
        freight_price_cents: mode === "freight" ? (hasRevenue ? cents("revenue") : 0) : null,
        rate_per_km: mode === "per_km" ? (hasRevenue ? number("revenue") : 0) : null,
        stops: toStoredStops(routedStops(stops)),
      };
      if (!Number.isInteger(trip.days) || trip.days < 1) throw new Error("Reiso trukmė turi būti sveikas skaičius, didesnis už nulį.");
      const tripLegs = legs.map(({ id }) => ({ country: text(`country-${id}`), km: number(`km-${id}`) }));
      if (Math.abs(tripLegs.reduce((sum, l) => sum + l.km, 0) - trip.paid_km - trip.empty_km) > 0.005) throw new Error("Šalių atkarpų suma turi sutapti su apmokamų ir tuščių km suma.");
      const calculation = calculateSavedTrip(trip, tripLegs, truckRowToCalc(truck), tariffs);
      setResult(calculation);
      setBePajamu(!hasRevenue);
      setApmokamiKm(trip.paid_km);
      setIstorija(routeHistory(ankstesni, trip.origin, trip.destination, tripId));
      setNepatikslinta(copiedTruckIds(trucks).has(truck.id) ? truck.plate : null);
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

  const prasomaKaina = result ? priceForMargin(result.totalCostCents, Number(norimaMarza)) : null;

  return <form
    ref={formRef}
    onSubmit={submit}
    onChange={() => { setResult(null); setSaved(""); }}
    onInvalidCapture={() => {
      // Tuščias privalomas laukas uždarytoje skiltyje blokuotų siuntimą be
      // jokio ženklo: atidarome ją ir iš naujo parodome, kurio lauko trūksta.
      if (detaliai) return;
      flushSync(() => setDetaliai(true));
      formRef.current?.reportValidity();
    }}
    className="space-y-6"
  >
    <fieldset disabled={saving} className="space-y-6 disabled:opacity-60">
      <Skiltis numeris={1} antraste="Kas ir kur veža">
        <div className="grid gap-4 sm:grid-cols-2">
          <label>Fura<select name="truck_id" required defaultValue={defaults.truck_id ?? ""} onChange={(event) => { normuPildymas.current = prefillRates(event.target.value); }} className={inputClass}><option value="">Pasirinkite furą</option>{trucks.map(t => <option key={t.id} value={t.id}>{t.plate}</option>)}</select></label>
          <label>Data<input name="trip_date" type="date" defaultValue={defaults.trip_date ?? ""} className={inputClass} /></label>
          <AddressField name="origin" label="Iš" value={stops[0].address} point={stops[0].point} onChange={(address, point) => updateStopAt(0, { address, point })} enabled={routeLookup} inputClass={inputClass} />
          <AddressField name="destination" label="Į" value={stops[stops.length - 1].address} point={stops[stops.length - 1].point} onChange={(address, point) => updateStopAt(stops.length - 1, { address, point })} enabled={routeLookup} inputClass={inputClass} />
          {/* Krovinio svorio niekas kitas žinoti negali, o kurui jis svarbus:
              20 t ir 5 t skiriasi trečdaliu kuro (#86). */}
          {routeLookup && <label>Krovinio svoris, t<input type="text" inputMode="decimal" value={krovinioSvoris} onChange={(event) => setKrovinioSvoris(event.target.value)} placeholder="20" className={inputClass} /></label>}
          {/* Marža kainos skaičiavimui, ne formos laukas: `stopPropagation`,
              kad jos keitimas nenuvalytų jau parodyto rezultato. */}
          <label>Norima marža (%)<input type="number" step="0.5" value={norimaMarza} onChange={(event) => { event.stopPropagation(); setNorimaMarza(event.target.value); }} className={inputClass} /></label>
        </div>
        {routeLookup && <div className="mt-3">
          <button type="button" disabled={kainaSkaiciuojama} onClick={() => void calculateQuote()} className="rounded-lg bg-accent p-3 text-accent-ink disabled:opacity-50">
            {kainaSkaiciuojama ? "Skaičiuojama…" : "Skaičiuoti kainą"}
          </button>
          {pastabos.length > 0 && <ul role="status" className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
            {pastabos.map((pastaba) => <li key={pastaba}>{pastaba}</li>)}
          </ul>}
          {marsrutas && <p role="status" className="mt-2 text-sm text-ink">{marsrutas}</p>}
          {tvarkarascioKlaida && <p role="alert" className="mt-2 text-sm text-bad">{tvarkarascioKlaida}</p>}
        </div>}
        {neivertintasKeltas !== null && <div className="mt-4 rounded-lg border border-warn bg-warn-soft p-4">
          <h3 className="font-semibold">Kelto bilieto kaina</h3>
          <p className="mt-1 text-sm text-ink">
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
          {keltoIvertis ? <p className="mt-3 text-sm text-ink">
            Į lauką „Keltai (€)“ įrašyta <strong>{formatCents(keltoIvertis.totalCents)}</strong>:
            bazė {formatCents(keltoIvertis.baseCents)} + BAF/GIR/ETS {formatCents(keltoIvertis.surchargeCents)}.
          </p> : <p role="alert" className="mt-3 text-sm text-bad">
            Šiam maršrutui arba ilgiui automatinio tarifo nėra. Kelto kainą įrašykite ranka.
          </p>}
          <p className="mt-2 text-xs text-muted">
            Scandlines viešas tarifas ({SCANDLINES_TARIFF_PERIOD}), be PVM; sutartinė kaina gali skirtis.{" "}
            <a href={SCANDLINES_TARIFF_URL} target="_blank" rel="noreferrer" className="underline">Tarifas</a>{" · "}
            <a href={SCANDLINES_SURCHARGE_URL} target="_blank" rel="noreferrer" className="underline">Priemokos</a>
          </p>
        </div>}
        {routeLookup && <div className="mt-3">
          {marsrutoPazeidimai.length > 0 && <div role="alert" className="mt-3 rounded-lg border border-warn bg-warn-soft p-4 text-sm text-ink">
            <p className="font-semibold">PTV aptiko maršruto apribojimų:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {marsrutoPazeidimai.map((violation, index) => <li key={`${violation.type}-${violation.property ?? ""}-${violation.distanceKm}-${index}`}>
                {violation.message}
                {violation.countryCode ? ` Šalis: ${violation.countryCode}.` : ""}
                {violation.distanceKm > 0 ? ` Apie ${violation.distanceKm} km nuo starto.` : " Ties maršruto pradžia."}
                {violation.temporary ? " Apribojimas laikinas." : ""}
                {violation.timeRestricted ? " Galioja tik nustatytu laiku." : ""}
              </li>)}
            </ul>
            <p className="mt-2">Prieš išsaugodami patikrinkite pakrovimo ir iškrovimo taškus bei vilkiko parametrus.</p>
          </div>}
        </div>}
        {routeLookup && <div className="mt-4">
          <h3 className="font-medium">Papildomi sustojimai</h3>
          <p className="mb-2 text-sm text-muted">Papildomas pakrovimas ar iškrovimas, CMR perdavimas, muitinė. Tipas išsaugomas su reisu.</p>
          {stopsEditor(false)}
        </div>}
        {routeLookup && <div className="mt-3">
          <RouteMap
            line={marsrutoLinija}
            stops={marsrutoSustojimai}
            violations={marsrutoPazeidimai}
            via={tarpiniai}
            busy={skaiciuoja}
            sidePanel={<div>
              <h3 className="mb-1 font-semibold">Sustojimai</h3>
              <p className="mb-3 text-sm text-muted">Pakeitus adresą, tvarką ar pridėjus sustojimą, maršrutas perskaičiuojamas pats.</p>
              {stopsEditor(true)}
            </div>}
            onAddVia={addVia}
            onMoveVia={moveVia}
            onRemoveVia={removeVia}
          />
          {marsrutoTrukmei && <TripDurationPanel km={marsrutoTrukmei.km} departure={marsrutoTrukmei.departure} />}
        </div>}
          {routeLookup && <div className="mt-3 rounded-xl border p-4">
            <div className="flex flex-wrap items-center gap-4">
              <button type="button" disabled={skaiciuoja} onClick={() => void fillFromRoute()} className="rounded-lg border bg-surface p-3 disabled:opacity-50">
                {skaiciuoja ? "Skaičiuojama…" : marsrutoLinija.length > 0 ? "Perskaičiuoti maršrutą" : "Skaičiuoti maršrutą"}
              </button>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={vengtiKeltu} onChange={(event) => setVengtiKeltu(event.target.checked)} />
                Vengti keltų
              </label>
            </div>
            {/* Rezultatas čia pat: keičiasi kartu su maršrutu (tempiant, keičiant sustojimus). */}
            {santrauka && <dl aria-live="polite" className={`mt-3 grid gap-x-6 gap-y-1 text-sm tabular-nums sm:grid-cols-4 ${skaiciuoja ? "opacity-60" : ""}`}>
              <div><dt className="text-muted">Atstumas</dt><dd className="font-semibold">{Math.round(santrauka.km).toLocaleString("lt-LT")} km</dd></div>
              <div><dt className="text-muted">Kelio laikas (PTV)</dt><dd className="font-semibold">{durationText(santrauka.travelMinutes)}{santrauka.delayMinutes > 0 && ` (+${santrauka.delayMinutes} min. eismas)`}</dd></div>
              <div><dt className="text-muted">Siūlomos paros</dt><dd className="font-semibold">{santrauka.days}</dd></div>
              <div><dt className="text-muted">Keliai</dt><dd className="font-semibold">{formatCents(santrauka.tollCents)}</dd></div>
            </dl>}
            {/* PTV kuro įvertis – papildoma informacija, ne kainos dalis, todėl
                laikomas čia, o ne pagrindiniame vaizde (#159). Pelnas
                skaičiuojamas pagal formos normą, kol jos sąmoningai nepakeisi. */}
            {emisijos && <p className="mt-3 text-sm tabular-nums">
              PTV kuro įvertis: {emisijos.fuelLitres.toFixed(0)} l
              {emisijos.litresPer100Km !== null && ` (${emisijos.litresPer100Km.toFixed(1)} l/100 km)`}
              {" · CO₂e "}{emisijos.co2eWellToWheelTonnes.toFixed(2)} t
              {!emisijuSvoriai && <span className="text-muted"> · be furos svorių</span>}
              {emisijos.litresPer100Km !== null && <button
                type="button"
                onClick={() => {
                  const field = formRef.current?.elements.namedItem("fuel_l_per_100km");
                  if (field instanceof HTMLInputElement && emisijos.litresPer100Km !== null) {
                    field.value = emisijos.litresPer100Km.toFixed(2);
                    setResult(null);
                    setSaved("");
                  }
                }}
                className="ml-2 underline"
              >
                Naudoti
              </button>}
            </p>}
          {/* Skirtumas tarp PTV siūlomų kelių yra pinigai: tas pats Panevėžys–
              Oslas gali skirtis 133 € vien mokesčiais (#84). */}
          <div className="mt-4 border-t pt-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={lyginama}
                onClick={() => {
                  rodytiVariantusRef.current = true;
                  setRodytiVariantus(true);
                  void compareRoutes();
                }}
                className="rounded-lg border bg-surface p-3 disabled:opacity-50"
              >
                {lyginama ? "Lyginama…" : rodytiVariantus ? "Perskaičiuoti variantus" : "Palyginti maršruto variantus"}
              </button>
              {rodytiVariantus && <button
                type="button"
                onClick={() => {
                  rodytiVariantusRef.current = false;
                  setRodytiVariantus(false);
                  setVariantai([]);
                  setVariantuKlaida("");
                }}
                className="underline"
              >
                Slėpti palyginimą
              </button>}
            </div>
            {rodytiVariantus && (routedStops(stops).length > 2 || tarpiniai.length > 0) && <p className="mt-2 text-sm text-muted">
              Variantai skaičiuojami tarp pirmo ir paskutinio sustojimo, be papildomų sustojimų ir tarpinių taškų:
              PTV alternatyvų su keliais taškais neteikia.
            </p>}
            {variantuKlaida && <p role="alert" className="mt-2 text-sm text-bad">{variantuKlaida}</p>}

            {variantai.length > 0 && <ul className="mt-3 space-y-2">
              {variantai.map((option) => {
                const key = option.routeId ?? "pagrindinis";
                const chosen = pasirinktas === key;

                return <li key={key} className={`rounded-lg border p-3 text-sm ${chosen ? "border-accent bg-accent-soft" : "bg-surface"}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold tabular-nums">
                      {Math.round(option.km)} km · {durationText(option.travelMinutes)}
                      {option.cheapest && <span className="ml-2 rounded bg-accent-soft px-2 py-0.5 text-xs font-bold text-good">pigiausias</span>}
                      {option.fastest && <span className="ml-2 rounded bg-raised px-2 py-0.5 text-xs font-bold text-ink">greičiausias</span>}
                    </span>
                    <button type="button" onClick={() => applyRouteOption(option)} className="underline">
                      {chosen ? "Pasirinktas" : "Rinktis šį"}
                    </button>
                  </div>
                  <p className="mt-1 tabular-nums text-ink">
                    Keliai {formatCents(option.tollCents)} · kuras {formatCents(option.fuelCents)} ·{" "}
                    {option.totalCents === null
                      ? <strong>iš viso neaišku, kol nežinoma kelto kaina</strong>
                      : <>iš viso <strong>{formatCents(option.totalCents)}</strong></>}
                  </p>
                  {option.ferryNames.length > 0 && <p className="mt-1 text-muted">
                    Keltas: {option.ferryNames.join(", ")}
                    {option.ferryPriceUnknown && " — PTV neturi jo bilieto kainos, todėl į sumą neįskaičiuota."}
                  </p>}
                  {option.violated && <p className="mt-1 text-warn">PTV pažymėjo šio kelio apribojimų.</p>}
                </li>;
              })}
            </ul>}
          </div>

          {/* Trukmė iki šiol buvo spėjimas – kelio valandos iš devynių. Paros
              yra 58 % kaštų, tad klaida parose yra klaida pelne (#87). */}
          <div className="mt-4 border-t pt-3">
            {(routedStops(stops).length > 2 || tarpiniai.length > 0) && <p className="mb-2 text-sm text-muted">
              PTV vairavimo laiko planas skaičiuojamas tarp pirmo ir paskutinio sustojimo.
            </p>}
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                Scenarijus
                <select
                  value={scenarijus}
                  onChange={(event) => setScenarijus(event.target.value as DriverScenario)}
                  className={`${inputClass} w-52`}
                >
                  {DRIVER_SCENARIOS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                </select>
              </label>
              <label className="text-sm">
                Jau vairavo, val.
                <input
                  type="text"
                  inputMode="decimal"
                  value={jauVairavo}
                  onChange={(event) => setJauVairavo(event.target.value)}
                  className={`${inputClass} w-24`}
                />
              </label>
              <button type="button" disabled={planuoja} onClick={() => void planDriverHours()} className="rounded-lg border bg-surface p-3 disabled:opacity-50">
                {planuoja ? "Planuojama…" : "Vairavimo laikas ir atvykimas"}
              </button>
            </div>

            {tvarkarascioKlaida && <p role="alert" className="mt-2 text-sm text-bad">{tvarkarascioKlaida}</p>}

            {tvarkarastis && <div className="mt-3 rounded-lg border bg-surface p-3 text-sm">
              <p className="font-semibold">Su privalomomis pertraukomis ir poilsiu</p>
              <p className="mt-1 tabular-nums">
                Vairavimas {durationText(tvarkarastis.drivingMinutes)} ·
                {" "}pertraukos {durationText(tvarkarastis.breakMinutes)} ·
                {" "}poilsis {durationText(tvarkarastis.restMinutes)}
                {tvarkarastis.waitingMinutes > 0 && ` · laukimas ${durationText(tvarkarastis.waitingMinutes)}`}
              </p>
              <p className="mt-1">
                Atvykimas <strong>{tvarkarastis.endTime.replace("T", " ").slice(0, 16)}</strong> UTC ·
                {" "}reisas apima <strong>{tvarkarastis.days} par.</strong>
              </p>
              {tvarkarastis.stops.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-ink">
                {tvarkarastis.stops.slice(0, 6).map((stop, index) => <li key={`${stop.startsAt}-${index}`}>
                  {stop.type === "BREAK" ? "Pertrauka" : stop.type === "DAILY_REST" ? "Paros poilsis" : stop.type === "WEEKLY_REST" ? "Savaitės poilsis" : "Laukimas"}
                  {" "}{durationText(stop.minutes)} ties {stop.distanceKm} km
                  {stop.countryCode && ` (${stop.countryCode})`}, {stop.startsAt.replace("T", " ").slice(0, 16)}
                </li>)}
              </ul>}
              <button
                type="button"
                onClick={() => {
                  const field = formRef.current?.elements.namedItem("days");
                  if (field instanceof HTMLInputElement) {
                    field.value = String(tvarkarastis.days);
                    setResult(null);
                    setSaved("");
                  }
                }}
                className="mt-2 underline"
              >
                Įrašyti {tvarkarastis.days} par. į trukmę
              </button>
            </div>}
          </div>

          </div>}
      </Skiltis>

      {/* Viskas, ką „Skaičiuoti kainą“ užpildo pati, – čia ir taisoma. Uždaryta
          skiltis tyliai blokuotų siuntimą dėl tuščio privalomo lauko, todėl
          `onInvalidCapture` ją atidaro ir parodo, kurio lauko trūksta. */}
      <details open={detaliai} onToggle={(event) => setDetaliai(event.currentTarget.open)} className="rounded-xl border p-4">
        <summary className="cursor-pointer font-semibold">Pakeisti ranka</summary>
        <div className="mt-4 space-y-6">

      <Skiltis numeris={2} antraste="Kada ir kiek">
        <div className="grid gap-4 sm:grid-cols-2">
          <label>Reiso nr.<input name="trip_number" type="text" defaultValue={defaults.trip_number ?? ""} className={inputClass} /></label>
          <label>Išvykimo laikas maršrutui<input name="departure_time" type="time" defaultValue="08:00" className={inputClass} /></label>
          {apimtiesFields.map(([name, label, step]) => <label key={name}>{label}<input name={name} type="number" min={name === "days" ? 1 : 0} max={name === "days" ? 2147483647 : undefined} step={step} required className={inputClass} defaultValue={defaults[name] ?? (name === "empty_km" ? "0" : undefined)} onChange={name === "days" ? () => setDienuSaltinis(null) : undefined} />
            {name === "days" && dienuSaltinis && <span className="mt-1 block text-sm text-muted">
              {dienuSaltinis.source === "schedule" ? "Iš PTV vairavimo laiko plano." : "Apytiksliai pagal kelio valandas – plano nėra."}
              {dienuSaltinis.stale && <strong className="text-warn"> Maršrutas pakeistas – paspauskite „Skaičiuoti kainą“ iš naujo.</strong>}
            </span>}
          </label>)}
        </div>
      </Skiltis>

      <Skiltis numeris={3} antraste="Kiek išleis">
        <div className="grid gap-4 sm:grid-cols-2">
          {kastuFields.map(([name, label, step]) => <label key={name}>{label}<input name={name} type="number" min="0" step={step} required className={inputClass} defaultValue={defaults[name] ?? (name.startsWith("adblue") ? "0" : undefined)} /></label>)}
          {extras.map(([name, label]) => <label key={name}>{label}<input name={name} type="text" inputMode="decimal" required defaultValue={defaults[name] ?? "0"} className={inputClass} /></label>)}
        </div>
        {normos && <p role="status" className="mt-2 text-sm text-muted">{normos}</p>}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">Nuo<input name="tele_from" type="date" className={inputClass} /></label>
          <label className="text-sm">Iki<input name="tele_to" type="date" className={inputClass} /></label>
          <button type="button" disabled={pildoma} onClick={() => void fillFromTelematics()} className="rounded-lg border bg-surface p-3 disabled:opacity-50">
            {pildoma ? "Imama…" : "Užpildyti iš telematikos"}
          </button>
        </div>
        {telematika && <p role="status" className="mt-2 text-sm text-ink">{telematika}</p>}
        {/* Vienintelis paaiškinimas, kurį verta palikti: be jo žmogus ieško,
            kur įvesti vairuotojo atlyginimą, ir gali jį įskaičiuoti dukart. */}
        <p className="mt-3 text-sm text-muted">Vairuotojas, draudimas ir nusidėvėjimas — jau furos paros savikainoje.</p>
      </Skiltis>

      <Skiltis numeris={4} antraste="Kiek gaus">
        <div className="grid gap-4 sm:grid-cols-2">
          <label>Pajamų būdas<select className={inputClass} value={mode} onChange={e => setMode(e.target.value)}><option value="freight">Frachto kaina</option><option value="per_km">Įkainis už apmokamą km</option></select></label>
          <label>{mode === "freight" ? "Frachto kaina (€)" : "Įkainis (€/km)"}<input key={mode} name="revenue" type={mode === "freight" ? "text" : "number"} inputMode="decimal" min="0" step="0.0001" defaultValue={defaults.revenue ?? ""} className={inputClass} /></label>
        </div>
      </Skiltis>

      {/* Atkarpos reikalingos tik tada, kai kelių kaina skaičiuojama pagal
          įkainius. Su PTV ar telematika ten lieka viena „Nemokami" eilutė,
          todėl skiltis suskleista ir nebeblaško. */}
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer font-semibold">Atkarpos pagal šalis</summary>
        <p className="mt-2 text-sm text-muted">Tik kai keliai skaičiuojami pagal šalių įkainius.</p>
        <div className="mt-3 space-y-3">
          {legs.map(leg => <div key={leg.id} className="flex flex-wrap items-end gap-3"><label className="flex-1">Šalis<select required name={`country-${leg.id}`} defaultValue={leg.country} className={inputClass}><option value="">Pasirinkite šalį</option>{tariffs.map(t => <option key={t.country} value={t.country}>{t.country}</option>)}</select></label><label>Atstumas (km)<input name={`km-${leg.id}`} type="number" min="0" step="0.01" required defaultValue={leg.km} className={inputClass} /></label><button type="button" disabled={legs.length === 1} onClick={() => { setLegs(current => current.filter(l => l.id !== leg.id)); setResult(null); setSaved(""); }} className="p-3 underline disabled:opacity-40">Pašalinti</button></div>)}
          <button type="button" className="underline" onClick={() => { setLegs(current => [...current, { id: nextId.current++, country: "", km: "" }]); setResult(null); setSaved(""); }}>Pridėti šalį</button>
        </div>
      </details>

        </div>
      </details>

      <div className="flex gap-3"><button ref={skaiciuotiMygtukas} type="submit" value="calculate" className="rounded-lg border p-3">Skaičiuoti pelną</button><button type="submit" value="save" disabled={!!saved} className="rounded-lg bg-accent p-3 text-accent-ink disabled:opacity-50">{saving ? "Saugoma…" : tripId ? "Išsaugoti pakeitimus" : "Išsaugoti reisą"}</button></div>

      {error && <p role="alert" className="text-bad">{error}</p>}
      {saved && <p role="status" className="text-good">{saved} <Link href="/trips" className="font-semibold underline">Rodyti reisus</Link></p>}

      {/* Rezultatas iškart po mygtukais: anksčiau jis būdavo už jų, ir
          paspaudus „Skaičiuoti" tekdavo slinkti žemyn pažiūrėti, kas išėjo. */}
      {result && <section aria-label="Reiso rezultatai" className="rounded-xl border-2 border-line bg-surface p-4">
        {/* Be pajamų „pelnas“ būtų minusas lygus kaštams ir klaidintų: čia
            klausimas yra kiek prašyti, todėl tai ir yra antraštė. */}
        {bePajamu ? <>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-semibold">Kaina, kurios prašyti</h2>
            <p className="text-2xl font-bold tabular-nums">{prasomaKaina === null ? "—" : formatCents(prasomaKaina)}</p>
          </div>
          <p className="mt-1 text-sm text-muted">
            {prasomaKaina === null
              ? "Tokia marža nepasiekiama — 100 % reikštų pajamas be kaštų."
              : `Kaštai ${formatCents(result.totalCostCents)} · marža ${norimaMarza} %${pricePerKm(prasomaKaina, apmokamiKm) !== null ? ` · ${pricePerKm(prasomaKaina, apmokamiKm)!.toFixed(2)} €/km` : ""}`}
          </p>
        </> : <>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-semibold">Reiso rezultatai</h2>
            <p className={`text-2xl font-bold ${result.profitCents >= 0 ? "text-good" : "text-bad"}`}>
              {formatCents(result.profitCents)} {result.profitCents >= 0 ? "pelnas" : "nuostolis"}
            </p>
          </div>
          <p className="mt-1 text-sm text-muted">
            Marža {result.marginPercent === null ? "—" : `${result.marginPercent.toFixed(1)}%`}
            {" · "}
            {result.profitPerKm === null ? "—" : `${result.profitPerKm.toFixed(2)} €/km`}
          </p>
        </>}
        {/* Paros savikaina yra didžioji reiso kaštų dalis. Jei ji nukopijuota
            nuo kitos furos, pelnas atrodo tikslus, o iš tikrųjų nėra (#111). */}
        {nepatikslinta && <p className="mt-3 rounded-lg bg-warn-soft p-3 text-sm text-warn">
          Furos {nepatikslinta} paros savikaina iki cento sutampa su kita fura — greičiausiai
          nepatikslinta. Tol, kol taip, šis pelnas apytikslis.{" "}
          <Link href="/trucks?skiltis=kastai" className="font-semibold underline">Patikslinti kaštus</Link>
        </p>}

        <dl className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-3">
          {[["Kuras", result.fuelCents], ["AdBlue", result.adblueCents], ["Keliai", result.roadCents], ["Fura", result.truckCents], ["Kaštai iš viso", result.totalCostCents], ["Pajamos", result.revenueCents]].filter(([label]) => !(bePajamu && label === "Pajamos")).map(([label, value]) => <div key={label}><dt className="text-sm text-muted">{label}</dt><dd className="font-semibold tabular-nums">{formatCents(Number(value))}</dd></div>)}
        </dl>

        {/* Atvirkštinis klausimas: kaštai žinomi, reikia kainos. Kai pajamų
            nėra, kaina jau parodyta antraštėje — antrą kartą jos nekartojame
            (#159). Tuščio skyriaus su linija be turinio irgi nerodome. */}
        {(!bePajamu || istorija) && <div className="mt-4 border-t pt-4">
          {!bePajamu && <h3 className="font-semibold">Kiek prašyti</h3>}
          {!bePajamu && <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              Norima marža (%)
              <input
                type="number"
                step="0.5"
                value={norimaMarza}
                onChange={(event) => { event.stopPropagation(); setNorimaMarza(event.target.value); }}
                className={`${inputClass} w-32`}
              />
            </label>
            {(() => {
              const kaina = priceForMargin(result.totalCostCents, Number(norimaMarza));
              if (kaina === null) {
                return <p className="text-sm text-muted">Tokia marža nepasiekiama — 100 % reikštų pajamas be kaštų.</p>;
              }
              const uzKm = pricePerKm(kaina, apmokamiKm);
              return (
                <p className="text-lg font-semibold tabular-nums">
                  {formatCents(kaina)}
                  {uzKm !== null && <span className="ml-2 text-sm font-normal text-muted">({uzKm.toFixed(2)} €/km)</span>}
                </p>
              );
            })()}
          </div>}

          {/* Marža įrašoma iš galvos, o tikroji riba yra kita: kiek už tą
              kryptį realiai moka. Istorija kainos nenustato, tik parodo, ar
              dabar prašoma daugiau, ar mažiau nei anksčiau (#109). */}
          {istorija && <div className="mt-3 rounded-lg bg-page p-3 text-sm">
            <p className="font-semibold">
              {istorija.matchType === "route" ? "Ta pati kryptis anksčiau" : "Į tą pačią vietą anksčiau"}
              <span className="ml-2 font-normal text-muted">
                {istorija.tripCount} reis. · paskutinis {istorija.lastTripDate}
              </span>
            </p>
            <p className="mt-1 tabular-nums">
              Mediana <strong>{formatCents(istorija.medianRevenueCents)}</strong>
              {istorija.medianPricePerKm !== null && <span> ({istorija.medianPricePerKm.toFixed(2)} €/km)</span>}
              <span className="text-muted">
                {" "}· nuo {formatCents(istorija.lowestRevenueCents)} iki {formatCents(istorija.highestRevenueCents)}
              </span>
              {istorija.medianMarginPercent !== null && <span className="text-muted"> · marža {istorija.medianMarginPercent.toFixed(1)} %</span>}
            </p>
            {/* Tik tada, kai tai ne ta pati kryptis: kitaip žmogus palaikytų
                kitos krypties kainas šios krypties kaina. */}
            {istorija.matchType !== "route" && <p className="mt-1 text-muted">
              Šios krypties dar nebuvo — tai kitų reisų į tą pačią vietą kainos.
            </p>}
          </div>}
        </div>}
      </section>}
    </fieldset>
  </form>;
}

/** Sunumeruota skiltis: vartotojas mato, kiek žingsnių liko. */
function Skiltis({ numeris, antraste, children }: { numeris: number; antraste: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-4">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-raised text-sm">{numeris}</span>
        {antraste}
      </h2>
      {children}
    </section>
  );
}
