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
import { priceForMargin, pricePerDay, pricePerKm } from "../../../lib/pricing";
import { checkMargin, formatMinMargin, targetBelowMin } from "../../../lib/margin-guard";
import { groupViolations, VIOLATION_ADVICE, VIOLATION_HEADINGS } from "../../../lib/route-violations";
import { fetchCompanySettings } from "../../../lib/company-settings";
import { countriesByDay, fitPerDiemDays, perDiemDays, sumPerDiem, type PerDiemDay } from "../../../lib/per-diem";
import { ensureCustomer, listCustomers, parseCustomerName, type Customer } from "../../../lib/customers";
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
import type { LineCoordinate } from "../../../lib/route-line";
import type { RouteViolation } from "../../../lib/ptv-route";
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

/**
 * Paspaudžia mygtuką, kai React jį vėl įjungia (#189). Išjungto mygtuko
 * `click()` nieko nedaro, o įjungiamas jis tik po kito piešimo.
 */
async function clickWhenEnabled(button: HTMLButtonElement | null) {
  for (let attempt = 0; attempt < 40 && button; attempt++) {
    if (!button.disabled) {
      button.click();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function durationText(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours} val. ${rest} min.` : `${rest} min.`;
}

/**
 * Paskutinės 30 pilnų dienų, baigiant vakar: tiekėjo teigimu, einamosios paros
 * eilutė netiksli. Už komponento ribų, nes render metu laiko imti negalima.
 */
function paskutinesTrisdesimtDienu(): { from: string; to: string } {
  const isoDate = (at: number) => new Date(at).toISOString().slice(0, 10);
  const dabar = Date.now();
  return { from: isoDate(dabar - 30 * 86_400_000), to: isoDate(dabar - 86_400_000) };
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
  /** Apmokami km skaičiavimo metu – reikia įkainiui už km pasiūlyme. */
  const [apmokamiKm, setApmokamiKm] = useState(0);
  const [paros, setParos] = useState(0);
  /** Norima marža pasiūlymui. Pradinė – tik atspirties taškas, ne norma. */
  const [norimaMarza, setNorimaMarza] = useState("15");
  /** Anksčiau išsaugoti reisai – kainos istorijai (#109). */
  const [ankstesni, setAnkstesni] = useState<TripSummary[]>([]);
  const [istorija, setIstorija] = useState<RouteHistory | null>(null);
  /** Įmonės minimali marža (#181). `null` – riba nenustatyta. */
  const [minMarza, setMinMarza] = useState<number | null>(null);
  /** Užsakovai (#183). `customersAvailable` – ar migracija 0014 paleista. */
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersAvailable, setCustomersAvailable] = useState(false);
  /** Įmonės dienpinigių procentas (#187). `null` – pagal šalis neskaičiuojama. */
  const [dienpinigiuProc, setDienpinigiuProc] = useState<number | null>(null);
  /**
   * Dienpinigiai pagal šalis kiekvienai dienai. `null` – fiksuoti furos.
   * `ref`, ne būsena: „Skaičiuoti kainą“ siunčia formą iškart po maršruto, ir
   * būsena tuo metu dar būtų sena.
   */
  const dienpinigiai = useRef<PerDiemDay[] | null>(null);
  const [dienpinigiuPastaba, setDienpinigiuPastaba] = useState("");
  /** Dienos, pagal kurias suskaičiuotas rodomas rezultatas. */
  const [skaiciuotiDienpinigiai, setSkaiciuotiDienpinigiai] = useState<PerDiemDay[] | null>(null);
  /** Furos numeris, kai jos paros savikaina atrodo nukopijuota (#111). */
  const [nepatikslinta, setNepatikslinta] = useState<string | null>(null);
  /** Krovinio svoris tonomis – tik PTV užklausai, reise nesaugomas (#86). */
  const [krovinioSvoris, setKrovinioSvoris] = useState("");
  /** Vairavimo laiko planas: pertraukos, poilsis ir teisėtas atvykimas (#87). */
  const [tvarkarastis, setTvarkarastis] = useState<RouteSchedule | null>(null);
  const [tvarkarascioKlaida, setTvarkarascioKlaida] = useState("");
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
  /**
   * Kol skaičiuojama kaina, automatinis maršruto perskaičiavimas laukia (#189):
   * kitaip jis nutraukia kainos maršruto užklausą ir ištrina rezultatą. Jei per
   * tą laiką pasikeitė sustojimai, kaina po to perskaičiuojama iš naujo.
   */
  const kainaVyksta = useRef(false);
  const laukiaPerskaiciavimo = useRef(false);
  const kainosMygtukas = useRef<HTMLButtonElement>(null);
  /** Vykstantis vairavimo laiko plano skaičiavimas ir jo duomenys (#189). */
  const planavimas = useRef<{ key: string; promise: Promise<number | null> } | null>(null);
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
        const [t, c, existing, nustatymai, uzsakovai] = await Promise.all([
          client.from("trucks").select("*").order("plate"),
          client.from("country_tariffs").select("country,rate,rate_type").order("country"),
          source ? getTripWithLegs(source) : null,
          fetchCompanySettings(client),
          // Užsakovų sąrašo klaida neturi užblokuoti reiso skaičiavimo.
          listCustomers(client).catch(() => ({ customers: [], available: false })),
        ]);
        if (t.error) throw t.error;
        if (c.error) throw c.error;
        if (!cancelled) {
          setMinMarza(nustatymai.minMarginPercent);
          setDienpinigiuProc(nustatymai.perDiemPercent);
          // Taisant ar kopijuojant – tos pačios šalys, kol maršrutas neperskaičiuotas.
          if (existing?.per_diem_days?.length) dienpinigiai.current = existing.per_diem_days;
          setCustomers(uzsakovai.customers);
          setCustomersAvailable(uzsakovai.available);
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
    if (kainaVyksta.current) {
      laukiaPerskaiciavimo.current = true;
      return;
    }
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
   * taškus: jie priklauso konkrečiam ruožui tarp dviejų sustojimų. Perskaičiuojama,
   * jei maršrutas jau buvo suskaičiuotas arba visi adresai patvirtinti – tada
   * pirmas maršrutas atsiranda pats, nelaukdamas mygtuko.
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
    if (recalc && (marsrutoLinija.length > 0 || next.every((stop) => stop.point))) scheduleRoute(via, next, 600);
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
    if (!form) return null;

    const value = (name: string) => {
      const field = form.elements.namedItem(name);
      return field instanceof HTMLInputElement ? field.value : "";
    };

    // Planas gali jau būti skaičiuojamas fone (paleistas po maršruto). Anksčiau
    // antras prašymas tada grąžindavo „nepavyko“, ir paros būdavo spėjamos (#189):
    // dabar palaukiama to paties, o jei duomenys kiti – po jo skaičiuojama iš naujo.
    const key = JSON.stringify([
      value("origin"), value("destination"), value("origin_point"), value("destination_point"),
      value("trip_date"), value("departure_time"), scenarijus, jauVairavo,
    ]);
    const running = planavimas.current;
    if (running) {
      const days = await running.promise;
      if (running.key === key) return days;
    }
    const promise = runDriverHours(value);
    planavimas.current = { key, promise };
    try {
      return await promise;
    } finally {
      if (planavimas.current?.promise === promise) planavimas.current = null;
    }
  }

  async function runDriverHours(value: (name: string) => string): Promise<number | null> {
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
      applyPerDiem(result.schedule);
      planasParodytas.current = true;
      return result.schedule.days;
    } catch {
      setTvarkarascioKlaida("Nepavyko suplanuoti vairavimo laiko.");
      return null;
    } finally {
    }
  }

  /**
   * Dienpinigiai pagal šalis iš PTV tvarkaraščio (#187). Šalis, kurios normos
   * nežinome, sumos neužpildo: tada lieka fiksuoti furos dienpinigiai, o ne
   * tikslu atrodantis, bet neteisingas skaičius.
   */
  function applyPerDiem(schedule: RouteSchedule) {
    if (dienpinigiuProc === null) return;
    const computed = perDiemDays(countriesByDay(schedule), dienpinigiuProc);
    if (computed.days.length === 0) return;
    if (computed.unknownCountries.length > 0) {
      dienpinigiai.current = null;
      setDienpinigiuPastaba(`Šalies ${computed.unknownCountries.join(", ")} dienpinigių normos sąraše nėra – naudojami fiksuoti furos dienpinigiai.`);
      return;
    }
    dienpinigiai.current = computed.days;
    setDienpinigiuPastaba("");
    setResult(null);
    setSaved("");
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
   * keliai neliečiami – juos spėti pagal praeitą mėnesį būtų prasimanymas.
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
      // furos – iš duomenų bazės, krovinio – iš šio reiso lauko (#86).
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
      setMarsrutoPazeidimai(result.violations);
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
        // Viešo kelto tarifo įvertis rodomas kelto skiltyje žemiau – čia jo
        // nekartojame (#159).
        needsFerryPrice && !publicFare
          ? `Keltas aptiktas${result.ferryNames.length ? ` (${result.ferryNames.join(", ")})` : ""}, bet automatinio tarifo nėra – įrašykite kainą lauke „Keltai (€)“.`
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
    if (!form || kainaVyksta.current) return;

    // Laukiantis automatinis perskaičiavimas nebereikalingas: kaina pati
    // skaičiuoja maršrutą su dabartiniais sustojimais.
    clearTimeout(routeTimer.current);
    kainaVyksta.current = true;
    laukiaPerskaiciavimo.current = false;
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
      const text = (name: string) => {
        const field = form.elements.namedItem(name);
        return field instanceof HTMLInputElement ? field.value : "";
      };
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
        noDeparture: !departureIso(text("trip_date"), text("departure_time")),
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
      kainaVyksta.current = false;
      if (laukiaPerskaiciavimo.current) {
        laukiaPerskaiciavimo.current = false;
        // Sustojimai pasikeitė skaičiuojant (pvz. adresas patikslintas po
        // paspaudimo): kaina perskaičiuojama su naujausiais. Spaudžiamas pats
        // mygtukas, kad būtų naudojami naujausi duomenys, o ne šio paspaudimo.
        void clickWhenEnabled(kainosMygtukas.current);
      }
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
      // Dienpinigiai pagal šalis pritaikomi prie įvestos trukmės (#187).
      const dienos = dienpinigiuProc !== null && dienpinigiai.current ? fitPerDiemDays(dienpinigiai.current, trip.days) : null;
      if (dienos && dienos.length > 0) {
        trip.per_diem_cents = sumPerDiem(dienos);
        trip.per_diem_days = dienos;
      }
      setSkaiciuotiDienpinigiai(dienos && dienos.length > 0 ? dienos : null);
      const tripLegs = legs.map(({ id }) => ({ country: text(`country-${id}`), km: number(`km-${id}`) }));
      if (Math.abs(tripLegs.reduce((sum, l) => sum + l.km, 0) - trip.paid_km - trip.empty_km) > 0.005) throw new Error("Šalių atkarpų suma turi sutapti su apmokamų ir tuščių km suma.");
      const calculation = calculateSavedTrip(trip, tripLegs, truckRowToCalc(truck), tariffs);
      setResult(calculation);
      setBePajamu(!hasRevenue);
      setApmokamiKm(trip.paid_km);
      setParos(trip.days);
      setIstorija(routeHistory(ankstesni, trip.origin, trip.destination, tripId));
      setNepatikslinta(copiedTruckIds(trucks).has(truck.id) ? truck.plate : null);
      if (action !== "save") return;
      const customerName = parseCustomerName(text("customer_name"));
      if (!customerName.ok) throw new Error(customerName.error);
      busy.current = true;
      setSaving(true);
      // Naujas užsakovas sukuriamas tik išsaugant, ne skaičiuojant: kitaip
      // kiekvienas bandymas su klaidingu pavadinimu paliktų šiukšlę sąraše.
      let customerId: string | null = null;
      if (customersAvailable && customerName.value !== null) {
        const customer = await ensureCustomer(getSupabaseClient(), customers, customerName.value);
        customerId = customer.id;
        if (!customers.some((existing) => existing.id === customer.id)) {
          setCustomers((current) => [...current, customer].sort((a, b) => a.name.localeCompare(b.name, "lt")));
        }
      }
      const persisted = await saveTrip({ ...trip, id: tripId, ...(customersAvailable ? { customer_id: customerId } : {}) }, tripLegs);
      // Lentelė jau yra, bet funkcija sena (0014 paleista tik iš dalies) –
      // užsakovas tyliai nepatektų į reisą, todėl pasakome.
      const customerLost = customerId !== null && persisted.customer_id !== customerId;
      // Be 0016 funkcija dienpinigių neįrašo – reisas liktų su fiksuotais,
      // ir sąraše pelnas skirtųsi nuo ką tik parodyto.
      const perDiemLost = trip.per_diem_cents != null && persisted.per_diem_cents !== trip.per_diem_cents;
      setSaved((tripId
        ? `Reiso ${persisted.trip_number} pakeitimai išsaugoti.`
        : `Reisas ${persisted.trip_number} išsaugotas.`)
        + (customerLost ? " Užsakovas neišsaugotas – Supabase iki galo paleiskite migraciją 0014." : "")
        + (perDiemLost ? " Dienpinigiai pagal šalis neišsaugoti – Supabase paleiskite migraciją 0016." : ""));
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label>Fura<select name="truck_id" required defaultValue={defaults.truck_id ?? ""} onChange={(event) => { normuPildymas.current = prefillRates(event.target.value); }} className={inputClass}><option value="">Pasirinkite furą</option>{trucks.map(t => <option key={t.id} value={t.id}>{t.plate}</option>)}</select></label>
          <label>Data<input name="trip_date" type="date" defaultValue={defaults.trip_date ?? ""} className={inputClass} /></label>
          {/* Užsakovas renkamas iš sąrašo arba įrašomas naujas – jis sukuriamas
              išsaugant reisą (#183). Kol migracija 0014 nepaleista, lauko nėra. */}
          {customersAvailable && <label>Užsakovas
            <input
              name="customer_name"
              list="uzsakovu-sarasas"
              autoComplete="off"
              placeholder="Pasirinkite arba įrašykite naują"
              defaultValue={customers.find((customer) => customer.id === defaults.customer_id)?.name ?? ""}
              className={inputClass}
            />
            <datalist id="uzsakovu-sarasas">
              {customers.map((customer) => <option key={customer.id} value={customer.name} />)}
            </datalist>
          </label>}
          <AddressField name="origin" label="Iš" value={stops[0].address} point={stops[0].point} onChange={(address, point) => updateStopAt(0, { address, point })} enabled={routeLookup} inputClass={inputClass} />
          <AddressField name="destination" label="Į" value={stops[stops.length - 1].address} point={stops[stops.length - 1].point} onChange={(address, point) => updateStopAt(stops.length - 1, { address, point })} enabled={routeLookup} inputClass={inputClass} />
          {/* Krovinio svorio niekas kitas žinoti negali, o kurui jis svarbus:
              20 t ir 5 t skiriasi trečdaliu kuro (#86). */}
          {routeLookup && <label>Krovinio svoris, t<input type="text" inputMode="decimal" value={krovinioSvoris} onChange={(event) => setKrovinioSvoris(event.target.value)} placeholder="20" className={inputClass} /></label>}
          {/* Marža kainos skaičiavimui, ne formos laukas: `stopPropagation`,
              kad jos keitimas nenuvalytų jau parodyto rezultato. */}
          <label>Norima marža (%)<input type="number" step="0.5" value={norimaMarza} onChange={(event) => { event.stopPropagation(); setNorimaMarza(event.target.value); }} className={inputClass} /></label>
          {/* Du vairuotojai sutrumpina reisą parą ar dvi – o paros yra didžioji kaštų dalis. */}
          {routeLookup && <label>Vairavimas
            <select value={scenarijus} onChange={(event) => setScenarijus(event.target.value as DriverScenario)} className={inputClass}>
              {DRIVER_SCENARIOS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>}
        </div>
        {routeLookup && <div className="mt-3">
          <div className="flex flex-wrap items-center gap-4">
            <button ref={kainosMygtukas} type="button" disabled={kainaSkaiciuojama} onClick={() => void calculateQuote()} className="rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink disabled:opacity-50">
              {kainaSkaiciuojama ? "Skaičiuojama…" : "Skaičiuoti kainą"}
            </button>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={vengtiKeltu} onChange={(event) => setVengtiKeltu(event.target.checked)} />
              Vengti keltų
            </label>
          </div>
          {marsrutas && <p role="status" className="mt-3 text-sm text-ink">{marsrutas}</p>}
          {/* Laikas – išvykimo vietos laiko juosta, kaip jį grąžina PTV (ne UTC). */}
          {tvarkarastis && <p className="mt-1 text-sm text-ink tabular-nums">
            Atvykimas {tvarkarastis.endTime.replace("T", " ").slice(0, 16)} · {tvarkarastis.days} par. · vairavimas {durationText(tvarkarastis.drivingMinutes)}, poilsis {durationText(tvarkarastis.restMinutes + tvarkarastis.breakMinutes)}
          </p>}
          {pastabos.length > 0 && <ul role="status" className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {pastabos.map((pastaba) => <li key={pastaba}>{pastaba}</li>)}
          </ul>}
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
        {/* Apribojimai sugrupuoti pagal vietą: prie pakrovimo ar iškrovimo tai
            adreso problema, ne maršruto (#193). */}
        {routeLookup && marsrutoPazeidimai.length > 0 && <div role="alert" className="mt-3 space-y-3 rounded-lg border border-warn bg-warn-soft p-4 text-sm text-ink">
          {groupViolations(marsrutoPazeidimai, santrauka?.km ?? null).map((group) => <div key={group.place}>
            <p className="font-semibold">{VIOLATION_HEADINGS[group.place]}:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {group.violations.map((violation, index) => <li key={`${violation.type}-${violation.property ?? ""}-${violation.distanceKm}-${index}`}>
                {violation.message}
                {violation.timeRestricted ? " Tik nustatytu laiku." : ""}
                {violation.temporary ? " Laikinas." : ""}
                {group.place === "route" && ` Apie ${Math.round(violation.distanceKm)} km nuo starto${violation.countryCode ? ` (${violation.countryCode})` : ""}.`}
              </li>)}
            </ul>
            <p className="mt-1">{VIOLATION_ADVICE[group.place]}</p>
          </div>)}
        </div>}
        {routeLookup && <div className="mt-4">
          <h3 className="mb-2 font-medium">Papildomi sustojimai</h3>
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
              <h3 className="mb-3 font-semibold">Sustojimai</h3>
              {stopsEditor(true)}
            </div>}
            onAddVia={addVia}
            onMoveVia={moveVia}
            onRemoveVia={removeVia}
          />
        </div>}
        {/* Skirtumas tarp PTV siūlomų kelių yra pinigai: tas pats Panevėžys–
            Oslas gali skirtis 133 € vien mokesčiais (#84). */}
        {routeLookup && marsrutoLinija.length > 0 && <div className="mt-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={lyginama}
              onClick={() => {
                rodytiVariantusRef.current = true;
                setRodytiVariantus(true);
                void compareRoutes();
              }}
              className="rounded-lg border bg-surface px-3 py-2 text-sm disabled:opacity-50"
            >
              {lyginama ? "Lyginama…" : rodytiVariantus ? "Perskaičiuoti variantus" : "Palyginti maršrutus"}
            </button>
            {rodytiVariantus && <button
              type="button"
              onClick={() => {
                rodytiVariantusRef.current = false;
                setRodytiVariantus(false);
                setVariantai([]);
                setVariantuKlaida("");
              }}
              className="text-sm underline"
            >
              Slėpti
            </button>}
            {rodytiVariantus && (routedStops(stops).length > 2 || tarpiniai.length > 0) && <span className="text-sm text-muted">
              Be papildomų sustojimų ir tarpinių taškų.
            </span>}
          </div>
          {variantuKlaida && <p role="alert" className="mt-2 text-sm text-bad">{variantuKlaida}</p>}

          {variantai.length > 0 && <ul className="mt-3 space-y-2">
            {variantai.map((option) => {
              const key = option.routeId ?? "pagrindinis";
              const chosen = pasirinktas === key;

              return <li key={key} className={`rounded-lg border p-3 text-sm ${chosen ? "border-accent bg-accent-soft" : "bg-surface"}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold tabular-nums">
                    {Math.round(option.km)} km · {durationText(option.travelMinutes)}
                    {option.cheapest && <span className="ml-2 rounded bg-accent-soft px-2 py-0.5 text-xs font-semibold text-good">pigiausias</span>}
                    {option.fastest && <span className="ml-2 rounded bg-raised px-2 py-0.5 text-xs font-semibold text-ink">greičiausias</span>}
                  </span>
                  <button type="button" onClick={() => applyRouteOption(option)} className="underline">
                    {chosen ? "Pasirinktas" : "Rinktis"}
                  </button>
                </div>
                <p className="mt-1 tabular-nums text-ink">
                  Keliai {formatCents(option.tollCents)} · kuras {formatCents(option.fuelCents)} ·{" "}
                  {option.totalCents === null
                    ? <strong>iš viso neaišku – nežinoma kelto kaina</strong>
                    : <>iš viso <strong>{formatCents(option.totalCents)}</strong></>}
                </p>
                {option.ferryNames.length > 0 && <p className="mt-1 text-muted">
                  Keltas: {option.ferryNames.join(", ")}
                  {option.ferryPriceUnknown && " – bilieto kaina neįskaičiuota."}
                </p>}
                {option.violated && <p className="mt-1 text-warn">Šiame kelyje yra apribojimų.</p>}
              </li>;
            })}
          </ul>}
        </div>}
      </Skiltis>

      {/* Viskas, ką „Skaičiuoti kainą“ užpildo pati, – čia ir taisoma. Uždaryta
          skiltis tyliai blokuotų siuntimą dėl tuščio privalomo lauko, todėl
          `onInvalidCapture` ją atidaro ir parodo, kurio lauko trūksta. */}
      <details open={detaliai} onToggle={(event) => setDetaliai(event.currentTarget.open)} className="rounded-xl border p-4">
        <summary className="cursor-pointer font-semibold">Pakeisti ranka</summary>
        <div className="mt-4 space-y-6">

      <Skiltis numeris={2} antraste="Kada ir kiek">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label>Reiso nr.<input name="trip_number" type="text" defaultValue={defaults.trip_number ?? ""} className={inputClass} /></label>
          <label>Išvykimo laikas<input name="departure_time" type="time" defaultValue="08:00" className={inputClass} /></label>
          {/* Jei vairuotojas jau vairavo, pirmas poilsis ateina anksčiau – keičia paras. */}
          {routeLookup && <label>Vairuotojas jau vairavo, val.<input type="text" inputMode="decimal" value={jauVairavo} onChange={(event) => setJauVairavo(event.target.value)} placeholder="0" className={inputClass} /></label>}
          {apimtiesFields.map(([name, label, step]) => <label key={name}>{label}<input name={name} type="number" min={name === "days" ? 1 : 0} max={name === "days" ? 2147483647 : undefined} step={step} required className={inputClass} defaultValue={defaults[name] ?? (name === "empty_km" ? "0" : undefined)} onChange={name === "days" ? () => setDienuSaltinis(null) : undefined} />
            {name === "days" && dienuSaltinis && <span className="mt-1 block text-sm text-muted">
              {dienuSaltinis.source === "schedule" ? "Iš PTV vairavimo laiko plano." : "Apytiksliai pagal kelio valandas – plano nėra."}
              {dienuSaltinis.stale && <strong className="text-warn"> Maršrutas pakeistas – paspauskite „Skaičiuoti kainą“ iš naujo.</strong>}
            </span>}
          </label>)}
        </div>
      </Skiltis>

      <Skiltis numeris={3} antraste="Kiek išleis">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kastuFields.map(([name, label, step]) => <label key={name}>{label}<input name={name} type="number" min="0" step={step} required className={inputClass} defaultValue={defaults[name] ?? (name.startsWith("adblue") ? "0" : undefined)} /></label>)}
          {extras.map(([name, label]) => <label key={name}>{label}<input name={name} type="text" inputMode="decimal" required defaultValue={defaults[name] ?? "0"} className={inputClass} /></label>)}
        </div>
        {normos && <p role="status" className="mt-2 text-sm text-muted">{normos}</p>}
        {/* Vienintelis paaiškinimas, kurį verta palikti: be jo žmogus ieško,
            kur įvesti vairuotojo atlyginimą, ir gali jį įskaičiuoti dukart. */}
        <p className="mt-3 text-sm text-muted">Vairuotojas, draudimas ir nusidėvėjimas – jau furos paros savikainoje.</p>
      </Skiltis>

      <Skiltis numeris={4} antraste="Kiek gaus">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label>Pajamų būdas<select className={inputClass} value={mode} onChange={e => setMode(e.target.value)}><option value="freight">Frachto kaina</option><option value="per_km">Įkainis už apmokamą km</option></select></label>
          <label>{mode === "freight" ? "Frachto kaina (€)" : "Įkainis (€/km)"}<input key={mode} name="revenue" type={mode === "freight" ? "text" : "number"} inputMode="decimal" min="0" step="0.0001" defaultValue={defaults.revenue ?? ""} className={inputClass} /></label>
        </div>
      </Skiltis>

      {/* Atkarpos reikalingos tik tada, kai kelių kaina skaičiuojama pagal
          įkainius. Su PTV ten lieka viena „Nemokami" eilutė,
          todėl skiltis suskleista ir nebeblaško. */}
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer font-semibold">Atkarpos pagal šalis (kai keliai pagal įkainius)</summary>
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
      {result && <section aria-label="Reiso rezultatai" className="rounded-lg border border-line-strong bg-surface p-4">
        {/* Be pajamų „pelnas“ būtų minusas lygus kaštams ir klaidintų: čia
            klausimas yra kiek prašyti, todėl tai ir yra antraštė. */}
        {bePajamu ? <>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-semibold">Kaina, kurios prašyti</h2>
            <p className="text-2xl font-semibold tabular-nums">{prasomaKaina === null ? "—" : formatCents(prasomaKaina)}</p>
          </div>
          <p className="mt-1 text-sm text-muted">
            {prasomaKaina === null
              ? "Tokia marža nepasiekiama – 100 % reikštų pajamas be kaštų."
              : `Su ${norimaMarza} % marža`}
          </p>
        </> : <>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-semibold">Reiso rezultatai</h2>
            <p className={`text-2xl font-semibold ${result.profitCents >= 0 ? "text-good" : "text-bad"}`}>
              {formatCents(result.profitCents)} {result.profitCents >= 0 ? "pelnas" : "nuostolis"}
            </p>
          </div>
          <p className="mt-1 text-sm text-muted">
            Marža {result.marginPercent === null ? "—" : `${result.marginPercent.toFixed(1)}%`}
            {/* Lėtas krovinys už km atrodo gerai, bet fura uždirba paromis (#179). */}
            {result.profitPerDayCents !== null && ` · ${formatCents(result.profitPerDayCents)} per parą`}
          </p>
        </>}
        {/* Paros savikaina yra didžioji reiso kaštų dalis. Jei ji nukopijuota
            nuo kitos furos, pelnas atrodo tikslus, o iš tikrųjų nėra (#111). */}
        {nepatikslinta && <p className="mt-3 rounded-lg bg-warn-soft p-3 text-sm text-warn">
          Furos {nepatikslinta} paros savikaina iki cento sutampa su kita fura – greičiausiai
          nepatikslinta. Tol, kol taip, šis pelnas apytikslis.{" "}
          <Link href="/trucks?skiltis=kastai" className="font-semibold underline">Patikslinti kaštus</Link>
        </p>}

        {/* Įmonės riba (#181): be jos per pigus užsakymas priimamas, nes skaičius
            tik parodomas, bet niekas jo nepažymi. */}
        {!bePajamu && (() => {
          const check = checkMargin({
            marginPercent: result.marginPercent,
            minMarginPercent: minMarza,
            totalCostCents: result.totalCostCents,
            revenueCents: result.revenueCents,
          });
          if (check.status !== "below") return null;
          const uzKm = check.priceAtMinCents === null ? null : pricePerKm(check.priceAtMinCents, apmokamiKm);
          return <p role="alert" className="mt-3 rounded-lg bg-bad-soft p-3 text-sm text-bad">
            Marža žemiau įmonės ribos {formatMinMargin(check.minMarginPercent)}.
            {check.priceAtMinCents !== null && <>
              {" "}Ribai pasiekti kaina turėtų būti bent <strong>{formatCents(check.priceAtMinCents)}</strong>
              {uzKm !== null && ` (${uzKm.toFixed(2)} €/km)`}
              {check.shortfallCents !== null && check.shortfallCents > 0 && <> – {formatCents(check.shortfallCents)} daugiau</>}.
            </>}
          </p>;
        })()}
        {bePajamu && targetBelowMin(Number(norimaMarza), minMarza) && minMarza !== null && <p role="alert" className="mt-3 rounded-lg bg-bad-soft p-3 text-sm text-bad">
          Norima marža {norimaMarza} % žemesnė už įmonės ribą {formatMinMargin(minMarza)}.
        </p>}

        {/* Kaina trimis matais: viso, per parą ir už apmokamą km. Užsakovas
            klausia €/km, o fura kainuoja paromis – reikia matyti abu. */}
        <table className="mt-4 w-full text-sm tabular-nums">
          <thead>
            <tr className="text-muted">
              <th className="py-1 text-left font-normal"><span className="sr-only">Kas</span></th>
              <th className="py-1 text-right font-normal">Iš viso</th>
              <th className="py-1 text-right font-normal">Per parą</th>
              <th className="py-1 text-right font-normal">€/km</th>
            </tr>
          </thead>
          <tbody>
            {([
              ["Savikaina", result.totalCostCents, false],
              [`Prašoma kaina (${norimaMarza} % marža)`, prasomaKaina, true],
              ...(bePajamu ? [] : [["Pajamos", result.revenueCents, false]]),
            ] as [string, number | null, boolean][]).map(([label, cents, target]) => {
              const perDay = cents === null ? null : pricePerDay(cents, paros);
              const perKm = cents === null ? null : pricePerKm(cents, apmokamiKm);
              return <tr key={label} className="border-t border-line">
                <th scope="row" className="py-1 pr-3 text-left font-normal">
                  {label}
                  {target && !bePajamu && minMarza !== null && targetBelowMin(Number(norimaMarza), minMarza) && <span className="block text-xs text-bad">žemiau įmonės ribos {formatMinMargin(minMarza)}</span>}
                </th>
                <td className="py-1 text-right font-semibold">{cents === null ? "—" : formatCents(cents)}</td>
                <td className="py-1 text-right">{perDay === null ? "—" : formatCents(perDay)}</td>
                <td className="py-1 text-right">{perKm === null ? "—" : perKm.toFixed(2)}</td>
              </tr>;
            })}
          </tbody>
        </table>

        <dl className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-3">
          {[["Kuras", result.fuelCents], ["AdBlue", result.adblueCents], ["Keliai", result.roadCents], ["Fura", result.truckCents], ["Kaštai iš viso", result.totalCostCents], ["Pajamos", result.revenueCents]].filter(([label]) => !(bePajamu && label === "Pajamos")).map(([label, value]) => <div key={label}><dt className="text-sm text-muted">{label}</dt><dd className="font-semibold tabular-nums">{formatCents(Number(value))}{label === "Fura" && paros > 0 && <span className="block text-xs font-normal text-muted">{formatCents(pricePerDay(Number(value), paros)!)} /parą × {paros}</span>}</dd></div>)}
        </dl>

        {/* Dienpinigiai – didelė „Furos“ dalis; matyti, iš kokių šalių jie
            suskaičiuoti, kad būtų galima patikrinti (#187). */}
        {dienpinigiuProc !== null && <p className="mt-3 text-sm text-muted">
          {skaiciuotiDienpinigiai
            ? <>Iš jų dienpinigiai pagal šalis <strong className="text-ink">{formatCents(result.perDiemCents)}</strong> ({String(dienpinigiuProc).replace(".", ",")} % normos):{" "}
              {skaiciuotiDienpinigiai.map((day, index) => `${index + 1} d. ${day.countries.join("/")} ${formatCents(day.cents)}`).join(" · ")}</>
            : <>Dienpinigiai fiksuoti – {formatCents(result.perDiemCents)} (furos paros suma × paros). Pagal šalis jie suskaičiuojami paspaudus „Skaičiuoti kainą“.</>}
          {dienpinigiuPastaba && <span className="block text-warn">{dienpinigiuPastaba}</span>}
        </p>}

        {/* Atvirkštinis klausimas: kaštai žinomi, reikia kainos. Kai pajamų
            nėra, kaina jau parodyta antraštėje – antrą kartą jos nekartojame
            (#159). Tuščio skyriaus su linija be turinio irgi nerodome. */}
        {istorija && <div className="mt-4 border-t pt-4">
          {/* Marža įrašoma iš galvos, o tikroji riba yra kita: kiek už tą
              kryptį realiai moka. Istorija kainos nenustato, tik parodo, ar
              dabar prašoma daugiau, ar mažiau nei anksčiau (#109). */}
          <div className="rounded-lg bg-page p-3 text-sm">
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
              Šios krypties dar nebuvo – tai kitų reisų į tą pačią vietą kainos.
            </p>}
          </div>
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
