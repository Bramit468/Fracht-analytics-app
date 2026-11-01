"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { getSupabaseClient } from "../../../lib/supabase";
import {
  estimateScandlinesFreightFare,
  SCANDLINES_SURCHARGE_URL,
  SCANDLINES_TARIFF_URL,
  type FerryFareEstimate,
  type FreightLoad,
} from "../../../lib/ferry-pricing";
import { centsToInput, formatCents, parseEuroToCents, parseSignedEuroToCents } from "../../../lib/money";
import { calcContribution } from "../../../lib/calc";
import { quoteVerdict } from "../../../lib/quote-verdict";
import { calculateSavedTrip } from "../../../lib/trip-input";
import { baselineQuote, pricePerDay, pricePerKm } from "../../../lib/pricing";
import { checkMargin, formatMinMargin } from "../../../lib/margin-guard";
import { groupViolations, VIOLATION_ADVICE, VIOLATION_HEADINGS } from "../../../lib/route-violations";
import { fetchCompanySettings } from "../../../lib/company-settings";
import { countriesByDay, fitPerDiemDays, perDiemCentsFor, perDiemDays, type PerDiemDay } from "../../../lib/per-diem";
import { ensureCustomer, listCustomers, parseCustomerName, type Customer } from "../../../lib/customers";
import { truckRowToCalc } from "../../../lib/truck";
import { copiedTruckIds } from "../../../lib/truck-costs-bulk";
import { getTripWithLegs, listTrips, saveTrip, type TripSummary } from "../../../lib/trips";
import { copyForNewTrip, tripDefaults } from "../../../lib/trip-copy";
import { routeHistory, type RouteHistory } from "../../../lib/route-history";
import { emptyKmByTruck } from "../../../lib/empty-km";
import { defaultEmptyKm, emptyKmTollCents, hoursBetween, pickDays, quoteDays, quoteNotes, serviceHours, SERVICE_HOURS_PER_STOP, type DaysSource } from "../../../lib/quick-quote";
import { fetchFuelPrices, fetchTelematicsFill } from "./telematics";
import { emptyRunToLoading } from "./empty-run";
import { emptyRunNote, GPS_VALID_DAYS } from "../../../lib/empty-run";
import { addDays } from "../../../lib/trip-progress";
import { contractFare, listFerryRates, type FerryRate } from "../../../lib/ferry-rates";
import { knownLoadFuel, terrainAdjustedFuel } from "../../../lib/fuel-terrain";
import {
  buildQuoteDraft,
  decisionPatch,
  DECISION_LABELS,
  getQuote,
  insertQuote,
  QUOTE_REASONS,
  quoteKey,
  quoteLogAction,
  QuoteLogError,
  quoteTripPrice,
  updateQuote,
  type QuoteDecision,
  type QuoteDraft,
  type QuoteSource,
} from "../../../lib/quotes";
import { MAX_OFFER_TEXT, mergeOffer, needsAi, offerSummary, offerWarnings, parseOffer, placeQuery, type OfferFields, type OfferPlace } from "../../../lib/offer-parse";
import { routeFuelPrice, type RouteFuelPrice } from "../../../lib/fuel-prices";
import type { CountryKm } from "../../../lib/ptv-route";
import { rateFill } from "@/lib/telematics-costs";
import {
  lookupRouteOptions,
  lookupSchedule,
  resolveAddress,
  type RouteOptionResult,
} from "./route-lookup";
import {
  DRIVER_SCENARIOS,
  type DriverScenario,
  type RouteSchedule,
} from "../../../lib/ptv-schedule";
import { todayInVilnius } from "../../../lib/local-date";
import { AddressField } from "./address-field";
import type { MapStop } from "./route-map";
import { RouteClient } from "./route-client";
import { StopsEditor } from "./stops-editor";

// MapLibre (~800 kB) reikia tik turint maršrutą, todėl kraunamas tada, ne su forma.
const RouteMap = dynamic(() => import("./route-map").then((module) => module.RouteMap), { ssr: false });
import type { LineCoordinate } from "../../../lib/route-line";
import type { RouteViolation } from "../../../lib/ptv-route";
import {
  STOP_TYPE_LABELS,
  addStop,
  buildWaypoints,
  moveStop,
  normalizeStops,
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
  ["days", "Reiso trukmė (paros)", "0.001"],
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
  /** Kelių mokesčiai be keltų ir tunelių – iš jų €/km tuštiems km. */
  tollCents: number;
  kmByCountry: CountryKm[];
  ferryUnknown: boolean;
  approximate: boolean;
  /** PTV kuro įvertis l/100 (HBEFA) – maršruto profiliui; `null`, jei PTV jo negrąžino. */
  ptvL100: number | null;
}

export function TripForm({
  tripId,
  copyFromId,
  quoteId,
  routeLookup = false,
}: {
  tripId?: string;
  /** Reisas, iš kurio kopijuojama į naują (#129). */
  copyFromId?: string;
  /** Pasiūlymas iš žurnalo, paverčiamas reisu (Phase 0, 5). */
  quoteId?: string;
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
  // Tikslinė marža nuo kainos; kaina pateikiama kaip baseline rate + kuras.
  const [norimaMarza, setNorimaMarza] = useState("15");
  // Sprendimas „imti ar ne“: su kuo lyginama ir kiek valandų sustojimams.
  const [krovimoVal, setKrovimoVal] = useState(String(SERVICE_HOURS_PER_STOP));
  const [altParos, setAltParos] = useState("0");
  const [altInasas, setAltInasas] = useState("0");
  const [minInasas, setMinInasas] = useState<number | null>(null);
  /** Įmonės sutartinės keltų kainos (0027). */
  const [keltuKainos, setKeltuKainos] = useState<FerryRate[]>([]);
  /** Įmonės derybų riba (0024). `null` – numatytoji 15 %. */
  const [derybuRiba, setDerybuRiba] = useState<number | null>(null);
  /** Tušti km skaičiavimo metu – verdikto eilutei. */
  const [tusciKm, setTusciKm] = useState(0);
  /** Ranka įrašyti tušti km: kol laukas netuščias, skaičiuoklė jų neperrašo. */
  const tusciKmRanka = useRef<number | null>(null);
  /** Furos kuro vidurkis (30 d.) – maršruto profilis jį koreguoja, bet neperrašo (`lib/fuel-terrain.ts`). */
  const bazineNorma = useRef<number | null>(null);
  /** Kuro normą žmogus pakeitė ranka – maršruto profilis jos neliečia. */
  const kuroRanka = useRef(false);
  /**
   * Vieno ekrano pasiūlymas: kaina skaičiuojama pati, kai užpildyti fura, data
   * ir abu adresai, o pakeista kaina perskaičiuojama be PTV – tik kai laukai
   * jau užpildyti bent vieno skaičiavimo.
   */
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const priceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const skaiciuota = useRef(false);
  /** Įklijuotas krovinio pasiūlymas (Phase 0, 4): tekstas ir ką iš jo užpildė. */
  const [pasiulymoTekstas, setPasiulymoTekstas] = useState("");
  const [pasiulymasSkaitomas, setPasiulymasSkaitomas] = useState(false);
  const [pasiulymoBusena, setPasiulymoBusena] = useState<{ summary: string; warnings: string[] } | null>(null);
  /** Iš kur atėjo pasiūlymas – žurnalui. `null` – vesta ranka. */
  const pasiulymoSaltinis = useRef<{ source: QuoteSource; text: string } | null>(null);
  /**
   * Pasiūlymų žurnalas (Phase 0, 5): kuri eilutė atnaujinama perskaičiuojant.
   * Įrašymai eina vienas po kito – kitaip du greiti perskaičiavimai sukurtų dvi eilutes.
   */
  const zurnalas = useRef<{ id: string | null; key: string; decided: boolean }>({ id: null, key: "", decided: false });
  const zurnaloEile = useRef<Promise<void>>(Promise.resolve());
  const konvertuojamas = useRef(false);
  const [zurnaloId, setZurnaloId] = useState<string | null>(null);
  const [zurnaloIspejimas, setZurnaloIspejimas] = useState("");
  const [sprendimas, setSprendimas] = useState<QuoteDecision>("pending");
  const [galutineKaina, setGalutineKaina] = useState("");
  const [priezastis, setPriezastis] = useState("");
  const [priezastiesTekstas, setPriezastiesTekstas] = useState("");
  const [sprendimoKlaida, setSprendimoKlaida] = useState("");
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
        const [t, c, existing, nustatymai, uzsakovai, quote, keltai] = await Promise.all([
          client.from("trucks").select("*").order("plate"),
          client.from("country_tariffs").select("country,rate,rate_type").order("country"),
          source ? getTripWithLegs(source) : null,
          fetchCompanySettings(client),
          // Užsakovų sąrašo klaida neturi užblokuoti reiso skaičiavimo.
          listCustomers(client).catch(() => ({ customers: [], available: false })),
          !source && quoteId ? getQuote(client, quoteId).catch(() => null) : null,
          // Be keltų kainų forma veikia kaip anksčiau – kaina lieka „nežinoma“.
          listFerryRates(client).catch(() => ({ rates: [], available: false })),
        ]);
        if (t.error) throw t.error;
        if (c.error) throw c.error;
        if (!cancelled) {
          setMinMarza(nustatymai.minMarginPercent);
          setMinInasas(nustatymai.minContributionCents);
          setDerybuRiba(nustatymai.negotiationBandPercent);
          setKeltuKainos(keltai.rates);
          // Taisant – ta alternatyva, kuria remtasi priimant. Kopijai ji nekeliama:
          // kitą kartą fura bus kitur.
          if (tripId && existing) {
            setAltParos(String(existing.alternative_days ?? 0).replace(".", ","));
            setAltInasas(centsToInput(existing.alternative_cents ?? 0).replace(".", ","));
          }
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
              : copyForNewTrip(existing, todayInVilnius());

            setDefaults(copy.defaults);
            const loadedStops = stopsFromStored(existing.stops, copy.defaults.origin ?? "", copy.defaults.destination ?? "");
            setStops(loadedStops);
            nextStopId.current = loadedStops.length;
            setMode(copy.revenueMode);
            if (copy.legs.length) {
              setLegs(copy.legs.map((leg, index) => ({ id: index, ...leg })));
              nextId.current = copy.legs.length;
            }
          } else if (quote) {
            // Pasiūlymas -> reisas: laukai iš žurnalo, o km, paros ir normos
            // skaičiuojamos iš naujo, kai forma atsiras (efektas žemiau).
            const price = quoteTripPrice(quote);
            setDefaults({
              ...(quote.truck_id ? { truck_id: quote.truck_id } : {}),
              ...(quote.trip_date ? { trip_date: quote.trip_date } : {}),
              ...(quote.customer_id ? { customer_id: quote.customer_id } : {}),
              origin: quote.origin,
              destination: quote.destination,
              ...(price !== null ? { revenue: centsToInput(price) } : {}),
            });
            const loadedStops = stopsFromStored(quote.stops, quote.origin, quote.destination);
            setStops(loadedStops);
            nextStopId.current = loadedStops.length;
            setMode("freight");
            zurnalas.current = { id: quote.id, key: quoteKey(quote.stops, quote.trip_date), decided: quote.decision !== "pending" };
            setZurnaloId(quote.id);
            setSprendimas(quote.decision);
            if (quote.final_price_cents !== null) setGalutineKaina(centsToInput(quote.final_price_cents));
            konvertuojamas.current = Boolean(quote.truck_id);
            if (quote.trip_id) setZurnaloIspejimas("Šis pasiūlymas jau paverstas reisu – išsaugojus atsiras dar vienas.");
          } else if (quoteId) {
            setZurnaloIspejimas("Pasiūlymo žurnale nerasta – užpildykite laukus ranka.");
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
  }, [attempt, tripId, copyFromId, quoteId]);

  // Pasiūlymas -> reisas: kai forma jau matoma, furos normos ir kaina
  // skaičiuojamos pačios – kaip pasirinkus furą ranka.
  useEffect(() => {
    if (loading || !konvertuojamas.current) return;
    konvertuojamas.current = false;
    const truck = formRef.current?.elements.namedItem("truck_id");
    if (!(truck instanceof HTMLSelectElement) || !truck.value) return;
    normuPildymas.current = prefillRates(truck.value);
    void normuPildymas.current.then(() => clickWhenEnabled(kainosMygtukas.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- vienkartinis paleidimas po įkėlimo
  }, [loading]);

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
    clearTimeout(quoteTimer.current);
    clearTimeout(priceTimer.current);
    routeClient.cancel();
  }, [routeClient]);

  /**
   * Ar kainą galima skaičiuoti be mygtuko: naujas reisas su PTV, pasirinkta
   * fura, data ir abu adresai patvirtinti (su tašku). Taisant išsaugotą reisą
   * niekas nepaleidžiama savaime – ten laukai yra tai, kas buvo tada.
   */
  function quoteReady(stopList: Stop[]): boolean {
    const form = formRef.current;
    if (!form || tripId || !routeLookup) return false;
    const truck = form.elements.namedItem("truck_id");
    const date = form.elements.namedItem("trip_date");
    return truck instanceof HTMLSelectElement && truck.value !== ""
      && date instanceof HTMLInputElement && date.value !== ""
      && stopList.length >= 2 && stopList.every((stop) => stop.point);
  }

  /**
   * Kaina per tą patį mygtuką, kaip spaudžiant ranka: tos pačios apsaugos nuo
   * lenktynių (#189), ir maršrutas skaičiuojamas vieną kartą – kainos viduje.
   */
  function scheduleQuote(delay = 400) {
    clearTimeout(routeTimer.current);
    clearTimeout(quoteTimer.current);
    if (kainaVyksta.current) {
      laukiaPerskaiciavimo.current = true;
      return;
    }
    quoteTimer.current = setTimeout(() => void clickWhenEnabled(kainosMygtukas.current), delay);
  }

  /** Pakeista kaina: tik formulė, be PTV. Nebaigtas rašyti skaičius laukia. */
  function schedulePriceRecalc(value: string) {
    clearTimeout(priceTimer.current);
    if (!skaiciuota.current || kainaVyksta.current) return;
    if (mode === "freight" && value.trim() !== "" && parseEuroToCents(value) === null) return;
    priceTimer.current = setTimeout(() => formRef.current?.requestSubmit(skaiciuotiMygtukas.current), 250);
  }

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
    // Viskas, ko reikia kainai, jau yra – skaičiuojama visa kaina, ne tik maršrutas.
    if (recalc && quoteReady(next)) scheduleQuote(600);
    else if (recalc && (marsrutoLinija.length > 0 || next.every((stop) => stop.point))) scheduleRoute(via, next, 600);
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

  /**
   * Įklijuotas pasiūlymas -> laukai (Phase 0, 4). Pirma taisyklės naršyklėje;
   * AI tik tada, kai be jo nėra adresų ar datos. Furos nerenkame ir nieko
   * neišsaugome: sustojimų pakeitimas pats paleidžia kainą, kaip rašant ranka.
   */
  async function applyOffer(text: string) {
    const form = formRef.current;
    if (!form || !text.trim() || pasiulymasSkaitomas) return;
    setPasiulymasSkaitomas(true);
    setPasiulymoBusena(null);
    try {
      const rules = parseOffer(text, todayInVilnius());
      pasiulymoSaltinis.current = { source: rules.fields.source, text };
      let fields: OfferFields = rules.fields;
      let usedAi = false;
      const warnings: string[] = [];
      if (needsAi(rules)) {
        try {
          const response = await fetch("/api/offer-parse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: text.slice(0, MAX_OFFER_TEXT) }),
          });
          const body = (await response.json().catch(() => null)) as { fields?: OfferFields; error?: string } | null;
          if (response.ok && body?.fields) {
            const merged = mergeOffer(rules.fields, body.fields);
            fields = merged.fields;
            usedAi = merged.fromAi.length > 0;
          } else {
            warnings.push(body?.error ?? "AI pasiūlymo neperskaitė – trūkstamus laukus įveskite ranka.");
          }
        } catch {
          warnings.push("AI nepasiekiamas – trūkstamus laukus įveskite ranka.");
        }
      }

      const places: { type: StopType; place: OfferPlace }[] = [
        ...(fields.loading ? [{ type: "loading" as const, place: fields.loading }] : []),
        ...fields.extraStops.map((stop) => ({ type: (stop.kind === "loading" ? "extra_loading" : "extra_unloading") as StopType, place: stop.place })),
        ...(fields.unloading ? [{ type: "unloading" as const, place: fields.unloading }] : []),
      ];
      // Adresas su tašku – kaip pasirinkus pasiūlymą: be taško kaina nepasileistų.
      const resolved = await Promise.all(places.map(async ({ type, place }) => {
        const query = placeQuery(place);
        const found = await resolveAddress(query).catch(() => null);
        return { type, address: found?.formattedAddress || query, point: found ? `${found.latitude},${found.longitude}` : "" };
      }));

      // Laukai pirma, sustojimai paskui: jų pakeitimas paleidžia kainą su šiais laukais.
      const setValue = (name: string, value: string) => {
        const field = form.elements.namedItem(name);
        if (field instanceof HTMLInputElement) field.value = value;
      };
      if (fields.loadingDate) setValue("trip_date", fields.loadingDate);
      if (fields.loadingTime) setValue("departure_time", fields.loadingTime);
      if (fields.priceCents !== null) {
        if (mode !== "freight") flushSync(() => setMode("freight"));
        setValue("revenue", centsToInput(fields.priceCents));
      }
      if (fields.weightKg !== null) setKrovinioSvoris(String(Math.round(fields.weightKg / 100) / 10).replace(".", ","));

      if (fields.loading && fields.unloading) {
        changeStops(normalizeStops(resolved.map((row) => ({ id: nextStopId.current++, ...row }))), { resetVia: true, recalc: true });
      } else if (resolved.length === 1) {
        const index = resolved[0].type === "loading" ? 0 : stops.length - 1;
        changeStops(updateStop(stops, index, { address: resolved[0].address, point: resolved[0].point }), { resetVia: false, recalc: Boolean(resolved[0].point) });
      }

      for (const row of resolved) {
        if (!row.point) warnings.push(`Adreso „${row.address}“ žemėlapyje nepavyko rasti – pasirinkite jį iš pasiūlymų.`);
      }
      setPasiulymoBusena({ summary: offerSummary(fields, usedAi), warnings: [...offerWarnings(fields), ...warnings] });
    } finally {
      setPasiulymasSkaitomas(false);
    }
  }

  /**
   * Suskaičiuotas pasiūlymas į žurnalą. Nepavykus kaina vis tiek rodoma –
   * žurnalas yra priedas, ne skaičiavimo sąlyga.
   */
  function logQuote(draft: QuoteDraft) {
    zurnaloEile.current = zurnaloEile.current.then(async () => {
      const key = quoteKey(draft.stops, draft.trip_date);
      const current = zurnalas.current;
      const action = quoteLogAction(current, key);
      if (action === "skip") return;
      try {
        if (action === "update" && current.id) {
          await updateQuote(getSupabaseClient(), current.id, draft);
          zurnalas.current = { ...current, key };
        } else {
          const id = await insertQuote(getSupabaseClient(), draft);
          zurnalas.current = { id, key, decided: false };
          setZurnaloId(id);
          setSprendimas("pending");
          setGalutineKaina("");
          setPriezastis("");
          setPriezastiesTekstas("");
        }
        setZurnaloIspejimas("");
      } catch (cause) {
        setZurnaloIspejimas(cause instanceof QuoteLogError ? cause.message : "Pasiūlymas į žurnalą neįrašytas.");
      }
    });
  }

  /** „Paėmėm / Deramės / Nepaėmėm“ – žmogaus sprendimas prie Bramit verdikto. */
  async function saveDecision(decision: Exclude<QuoteDecision, "pending">) {
    setSprendimoKlaida("");
    const reason = priezastis === "Kita" ? priezastiesTekstas || "Kita" : priezastis;
    const parsed = decisionPatch(decision, galutineKaina, reason);
    if (!parsed.ok) {
      setSprendimoKlaida(parsed.error);
      return;
    }
    // Palaukiama, kol įsirašys paskutinis skaičiavimas – kitaip sprendimas atitektų ne tai eilutei.
    await zurnaloEile.current;
    const id = zurnalas.current.id;
    if (!id) {
      setSprendimoKlaida("Pasiūlymas dar neįrašytas į žurnalą.");
      return;
    }
    try {
      await updateQuote(getSupabaseClient(), id, parsed.patch);
      zurnalas.current = { ...zurnalas.current, decided: true };
      setSprendimas(decision);
    } catch (cause) {
      setSprendimoKlaida(cause instanceof QuoteLogError ? cause.message : "Sprendimas neįrašytas.");
    }
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
      // Trupmenomis, ne kalendorinėmis paromis: 2,4 paros neturi kainuoti kaip 3.
      const hours = hoursBetween(result.schedule.startTime, result.schedule.endTime);
      return hours === null ? null : hours / 24;
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

  /** Kelto priemoka – pagal reiso mėnesį; be datos – šios dienos. */
  function ferryDate(): string {
    const field = formRef.current?.elements.namedItem("trip_date");
    return (field instanceof HTMLInputElement && field.value) || todayInVilnius();
  }

  /** Įrašo viešo tarifo įvertį į tą patį lauką, kurį galima pataisyti ranka. */
  function applyFerryEstimate(names: readonly string[], length: string, load: FreightLoad) {
    const estimate = estimateScandlinesFreightFare(names, Number(length), load, ferryDate());
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
    // Kita fura – senos furos vidurkis nebetinka (kol nauja neužpildyta – imamas laukas).
    bazineNorma.current = null;
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
      // Furos tikras vidurkis – pagrindas, kurį maršruto profilis tik koreguoja.
      const norm = Number(result.fill.fuel_l_per_100km);
      bazineNorma.current = norm > 0 ? norm : null;
      kuroRanka.current = false;

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
          // Įrašytas 0 – tuščia fura (PTV tada nelaiko jos pilnos); tuščias laukas – nežinoma.
          loadWeightKg: krovinioSvoris.trim() !== "" && Number.isFinite(loadTonnes) && loadTonnes >= 0 ? loadTonnes * 1000 : null,
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

      // Pirmiausia – įmonės sutartinė kaina (0027), tik tada viešas tarifas.
      const contract = result.ferryDetected && result.ferriesCents === 0 ? contractFare(result.ferryNames, keltuKainos) : null;
      if (contract && write) {
        const field = form.elements.namedItem("ferries_cents");
        if (field instanceof HTMLInputElement) field.value = centsToInput(contract.totalCents);
      }
      const needsFerryPrice = result.ferryDetected && result.ferriesCents === 0 && !contract;
      setNeivertintasKeltas(needsFerryPrice ? result.ferryNames : null);
      // Redaguojant tarifas tik paskaičiuojamas, bet į lauką neįrašomas.
      const publicFare = !needsFerryPrice
        ? null
        : write
          ? applyFerryEstimate(result.ferryNames, keltoIlgis, keltoKrovinys)
          : estimateScandlinesFreightFare(result.ferryNames, Number(keltoIlgis), keltoKrovinys, ferryDate());
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
        contract
          ? `Keltas – jūsų sutartinė kaina: ${contract.lines.map((line) => `${line.label} ${formatCents(line.cents)}`).join(", ")}.`
          : "",
        result.avoidedFerries && result.ferryDetected
          ? "PTV šio kelto išvengti negalėjo."
          : "",
      ].filter(Boolean).join(" ");

      const shownFerryCents = contract?.totalCents ?? publicFare?.totalCents ?? result.ferriesCents;
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
        tollCents: result.bridgesCents,
        kmByCountry: result.kmByCountry,
        ferryUnknown: needsFerryPrice && !publicFare,
        approximate: result.approximate,
        // PTV kuro įvertis pagal nuolydžius, kelius ir svorį – maršruto profiliui.
        ptvL100: result.emissions?.litresPer100Km ?? null,
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
      const kuroLaikotarpis = paskutinesTrisdesimtDienu();
      const truckField = form.elements.namedItem("truck_id");
      const truckValue = truckField instanceof HTMLSelectElement ? truckField.value : "";
      const dateField = form.elements.namedItem("trip_date");
      const quoteDate = dateField instanceof HTMLInputElement ? dateField.value : "";
      // Ranka įrašyti tušti km – dispečeris žino geriau: jų neperrašome ir PTV neklausiame.
      const rankaTusti = write ? tusciKmRanka.current : null;
      const [route, scheduleDays, kuroKainos, tuscias] = await Promise.all([
        fillFromRoute(tarpiniai, write, stops),
        planDriverHours(),
        // Kuro kaina – pagal šalis, per kurias eina maršrutas, ne pagal tai, kur fura pylėsi praėjusį mėnesį.
        fetchFuelPrices(kuroLaikotarpis.from, kuroLaikotarpis.to).catch(() => null),
        // Tušti km nuo ten, kur fura bus – tik naujam reisui: išsaugoto laukai nekeičiami.
        write && rankaTusti === null && truckValue && quoteDate && (stops[0].address.trim() || stops[0].point)
          ? emptyRunToLoading(truckValue, quoteDate, { address: stops[0].address, point: stops[0].point }).catch(() => null)
          : Promise.resolve(null),
      ]);
      const emptyRun = tuscias?.ok ? tuscias : null;
      const routeFuel: RouteFuelPrice | null = route && kuroKainos ? routeFuelPrice(route.kmByCountry, kuroKainos) : null;

      const picked = pickDays(scheduleDays, route?.routeDays ?? null);
      const sustojimuVal = serviceHours(stops.map((stop) => stop.type), Number(krovimoVal.replace(",", ".")));
      // Kelias iki pakrovimo irgi užima furos laiką, nors už jį niekas nemoka.
      const tusciuVal = emptyRun ? emptyRun.travelMinutes / 60 : 0;
      const quoted = quoteDays(picked.days, sustojimuVal + tusciuVal);
      const text = (name: string) => {
        const field = form.elements.namedItem(name);
        return field instanceof HTMLInputElement ? field.value : "";
      };
      const plate = trucks.find((truck) => truck.id === truckValue)?.plate;
      const emptyShare = emptyKmByTruck(ankstesni).find((row) => row.plate === plate)?.emptyShare ?? null;
      const emptyKm = rankaTusti ?? (emptyRun ? emptyRun.km : route ? defaultEmptyKm(route.paidKm, emptyShare) : 0);
      // Vėlesniam kroviniui dabartinė vieta netinka – primename, kad žinant galima įrašyti ranka.
      const veliauNeiRytoj = quoteDate !== "" && quoteDate > addDays(todayInVilnius(), GPS_VALID_DAYS);
      const tusciuPastaba = rankaTusti !== null
        ? `Tušti km: ${String(rankaTusti).replace(".", ",")} – įrašyta ranka. Kad skaičiuotų pats, ištrinkite lauką „Tušti km“.`
        : emptyRun && route
          ? emptyRunNote(emptyRun.start, emptyRun.km, tusciuVal, write)
          : write && veliauNeiRytoj && !emptyRun
            ? `Tušti km: ${String(emptyKm).replace(".", ",")} – pagal furos istoriją, nes krovinys vėliau nei rytoj, o furos reisas iki tol nežinomas. Jei žinote, iš kur fura atvažiuos, įrašykite tuščius km ranka („Pakeisti ranka“ → „Tušti km“).`
            : undefined;
      const emptyTollCents = emptyRun
        ? emptyRun.tollCents
        : route ? emptyKmTollCents(route.tollCents, route.paidKm, emptyKm) : 0;

      // Kuro norma pagal maršrutą: furos vidurkis × PTV profilis (kalnai, keliai, svoris).
      let fuelNote: string | undefined;
      if (write && route && !kuroRanka.current) {
        const fuelField = form.elements.namedItem("fuel_l_per_100km");
        if (fuelField instanceof HTMLInputElement) {
          if (bazineNorma.current === null && Number(fuelField.value) > 0) bazineNorma.current = Number(fuelField.value);
          // Žinomas krovinio svoris – PTV su juo tikslus (±7 %); nežinomas – furos vidurkis × profilis.
          const tonnes = Number(krovinioSvoris.replace(",", "."));
          const loadKnown = krovinioSvoris.trim() !== "" && Number.isFinite(tonnes) && tonnes >= 0;
          const adjusted = loadKnown ? knownLoadFuel(route.ptvL100, tonnes) : terrainAdjustedFuel(bazineNorma.current, route.ptvL100);
          if (adjusted) {
            fuelField.value = String(adjusted.litresPer100Km);
            fuelNote = adjusted.note;
          }
        }
      }

      if (write) {
        const days = form.elements.namedItem("days");
        if (days instanceof HTMLInputElement && quoted !== null) days.value = String(quoted);
        setDienuSaltinis(quoted !== null ? { source: picked.source, stale: false } : null);

        if (route) {
          const empty = form.elements.namedItem("empty_km");
          if (empty instanceof HTMLInputElement) empty.value = String(emptyKm);
          const fuelPrice = form.elements.namedItem("fuel_price");
          if (fuelPrice instanceof HTMLInputElement && routeFuel) fuelPrice.value = String(routeFuel.pricePerL);
          // Maršrutas ką tik įrašė pakrauto kelio mokesčius; tušti km prie jų pridedami.
          const bridges = form.elements.namedItem("bridges_cents");
          const routeCents = bridges instanceof HTMLInputElement ? parseEuroToCents(bridges.value) : null;
          if (bridges instanceof HTMLInputElement && routeCents !== null) bridges.value = centsToInput(routeCents + emptyTollCents);
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
        days: quoted,
        daysSource: quoted === null ? "none" : picked.source,
        emptyKm,
        emptyTollCents: write ? emptyTollCents : 0,
        serviceHours: sustojimuVal,
        routeFuel: route ? routeFuel : undefined,
        emptyShare,
        emptyRunNote: tusciuPastaba,
        fuelNote,
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
      if (!alternatyva) throw new Error("Alternatyvos laukai neteisingi: paros – neneigiamas skaičius, įnašas – eurais.");
      trip.alternative_days = alternatyva.days;
      trip.alternative_cents = alternatyva.contributionCents;
      // Importuoti reisai turi paras trupmenomis (valandos / 24, 0019).
      if (!(trip.days > 0)) throw new Error("Reiso trukmė turi būti didesnė už nulį.");
      // Dienpinigiai pagal šalis pritaikomi prie įvestos trukmės (#187).
      const dienos = dienpinigiuProc !== null && dienpinigiai.current ? fitPerDiemDays(dienpinigiai.current, Math.ceil(trip.days)) : null;
      if (dienos && dienos.length > 0) {
        trip.per_diem_cents = perDiemCentsFor(dienos, trip.days);
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
      setTusciKm(trip.empty_km);
      skaiciuota.current = true;
      // Žurnalas – tik naujam reisui ir tik su kaina: be jos verdikto nėra.
      if (!tripId && hasRevenue) {
        const contribution = calcContribution(calculation, trip.days, alternatyva);
        const customerName = text("customer_name").toLowerCase();
        logQuote(buildQuoteDraft({
          truckId: truck.id,
          tripDate: trip.trip_date,
          stops: trip.stops ?? [],
          customerId: customers.find((customer) => customer.name.trim().toLowerCase() === customerName)?.id ?? null,
          source: pasiulymoSaltinis.current?.source ?? "manual",
          offerText: pasiulymoSaltinis.current?.text ?? null,
          priceCents: calculation.revenueCents,
          paidKm: trip.paid_km,
          emptyKm: trip.empty_km,
          days: trip.days,
          totalCostCents: calculation.totalCostCents,
          contributionCents: contribution.contributionCents,
          verdict: quoteVerdict({
            priceCents: calculation.revenueCents,
            totalCostCents: calculation.totalCostCents,
            contributionCents: contribution.contributionCents,
            days: trip.days,
            bandPercent: derybuRiba,
            beatsAlternative: contribution.take,
          }),
        }));
      }
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
      // Be 0023 alternatyva neįrašoma – atidarius reisą verdiktas būtų kitas.
      const alternativeLost = (trip.alternative_days !== 0 || trip.alternative_cents !== 0) && persisted.alternative_cents === undefined;
      // Išsaugotas reisas – laimėtas pasiūlymas: žurnale jis susiejamas su reisu.
      if (!tripId) {
        await zurnaloEile.current;
        const quote = zurnalas.current.id;
        if (quote) {
          try {
            await updateQuote(getSupabaseClient(), quote, {
              trip_id: persisted.id,
              decision: "taken",
              outcome: "won",
              final_price_cents: persisted.freight_price_cents ?? calculation.revenueCents,
            });
            zurnalas.current = { ...zurnalas.current, decided: true };
            setSprendimas("taken");
          } catch {
            setZurnaloIspejimas("Reisas išsaugotas, bet pasiūlymas žurnale nepažymėtas laimėtu.");
          }
        }
      }
      setSaved((tripId
        ? `Reiso ${persisted.trip_number} pakeitimai išsaugoti.`
        : `Reisas ${persisted.trip_number} išsaugotas.`)
        + (customerLost ? " Užsakovas neišsaugotas – Supabase iki galo paleiskite migraciją 0014." : "")
        + (perDiemLost ? " Dienpinigiai pagal šalis neišsaugoti – Supabase paleiskite migraciją 0016." : "")
        + (alternativeLost ? " Alternatyva neišsaugota – Supabase paleiskite migraciją 0023." : ""));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nepavyko išsaugoti reiso. Patikrinkite ryšį su duomenų baze ir ar pritaikyta migracija 0004.");
    } finally { busy.current = false; setSaving(false); }
  }

  if (loading) return <p role="status">{tripId ? "Kraunamas reisas…" : "Kraunamos furos ir kelių įkainiai…"}</p>;
  if (!trucks.length || !tariffs.length) return <div><p role="alert">{error || "Pirma įveskite furas ir šalių įkainius."}</p><button type="button" className="mt-3 underline" onClick={() => { setLoading(true); setError(""); setAttempt(a => a + 1); }}>Bandyti dar kartą</button></div>;

  const kaina = result ? baselineQuote(result.totalCostCents, result.fuelCents, Number(norimaMarza.replace(",", "."))) : null;
  const prasomaKaina = kaina?.priceCents ?? null;
  const kainaZemiauRibos = kaina !== null && minMarza !== null && Number(norimaMarza.replace(",", ".")) < minMarza;
  const altDienos = Number(altParos.replace(",", "."));
  const altCents = parseSignedEuroToCents(altInasas);
  const alternatyva = Number.isFinite(altDienos) && altDienos >= 0 && altCents !== null && Math.abs(altCents) <= 2147483647
    ? { days: altDienos, contributionCents: altCents, thresholdCents: minInasas ?? 0 }
    : null;
  const inasas = result && alternatyva ? calcContribution(result, paros, alternatyva) : null;
  // Vienos eilutės atsakymas: Imti / Derėtis iki X € / Neimti (įmonės taisyklė – žemiausia kaina savikaina).
  const verdiktas = result && inasas && !bePajamu
    ? quoteVerdict({
      priceCents: result.revenueCents,
      totalCostCents: result.totalCostCents,
      contributionCents: inasas.contributionCents,
      days: paros,
      bandPercent: derybuRiba,
      beatsAlternative: inasas.take,
    })
    : null;
  const skaicius = (value: number) => value.toLocaleString("lt-LT", { maximumFractionDigits: 2 });
  const sveikiEurai = (cents: number) => `${(cents / 100).toLocaleString("lt-LT", { maximumFractionDigits: 0 })} €`;

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
        {/* Pasiūlymas iš biržos ar laiško: įklijavus laukai užsipildo patys.
            `stopPropagation` – tekstas ne formos laukas ir rezultato nenuvalo. */}
        {!tripId && routeLookup && <div className="mb-4">
          <label className="block">Įklijuoti pasiūlymą
            <textarea
              value={pasiulymoTekstas}
              rows={2}
              maxLength={MAX_OFFER_TEXT}
              placeholder="Įklijuokite krovinio skelbimą iš Timocom, Trans.eu ar laiško – laukai užsipildys patys"
              onChange={(event) => { event.stopPropagation(); setPasiulymoTekstas(event.target.value); }}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData("text");
                if (!pasted.trim()) return;
                event.preventDefault();
                setPasiulymoTekstas(pasted);
                void applyOffer(pasted);
              }}
              className={inputClass}
            />
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <button type="button" disabled={pasiulymasSkaitomas || !pasiulymoTekstas.trim()} onClick={() => void applyOffer(pasiulymoTekstas)} className="rounded-md border border-line px-3 py-1.5 disabled:opacity-50">
              {pasiulymasSkaitomas ? "Skaitoma…" : "Užpildyti"}
            </button>
            {pasiulymoBusena?.summary && <span>{pasiulymoBusena.summary}</span>}
          </div>
          {pasiulymoBusena?.warnings.map((warning) => <p key={warning} className="mt-1 text-sm text-warn">{warning}</p>)}
        </div>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label>Fura<select name="truck_id" required defaultValue={defaults.truck_id ?? ""} onChange={(event) => { normuPildymas.current = prefillRates(event.target.value); if (quoteReady(stops)) scheduleQuote(); }} className={inputClass}><option value="">Pasirinkite furą</option>{trucks.map(t => <option key={t.id} value={t.id}>{t.plate}</option>)}</select></label>
          <label>Data<input name="trip_date" type="date" defaultValue={defaults.trip_date ?? ""} onChange={() => { if (quoteReady(stops)) scheduleQuote(); }} className={inputClass} /></label>
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
          {/* Kaina – viršuje: be jos nėra ir verdikto. Keičiant ją PTV nekviečiamas,
              perskaičiuojama tik formulė (`stopPropagation` – nenuvalyti rezultato). */}
          <label>{mode === "freight" ? "Kaina (€)" : "Įkainis (€/km)"}<input key={mode} name="revenue" type={mode === "freight" ? "text" : "number"} inputMode="decimal" min="0" step="0.0001" defaultValue={defaults.revenue ?? ""} placeholder={mode === "freight" ? "Tuščia – parodys tinkamą kainą" : undefined} onChange={(event) => { event.stopPropagation(); setSaved(""); schedulePriceRecalc(event.currentTarget.value); }} className={inputClass} /></label>
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
            Atvykimas {tvarkarastis.endTime.replace("T", " ").slice(0, 16)} · {skaicius((hoursBetween(tvarkarastis.startTime, tvarkarastis.endTime) ?? 0) / 24)} par. kelio · vairavimas {durationText(tvarkarastis.drivingMinutes)}, poilsis {durationText(tvarkarastis.restMinutes + tvarkarastis.breakMinutes)}
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
          {keltoIvertis?.surcharge.stale && <p role="alert" className="mt-3 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn">
            Priemoka {keltoIvertis.surcharge.month} – gali būti pasikeitusi. Patikrinkite Scandlines priemokas ir, jei reikia, pataisykite kelto sumą.
          </p>}
          {keltoIvertis ? <p className="mt-3 text-sm text-ink">
            Į lauką „Keltai (€)“ įrašyta <strong>{formatCents(keltoIvertis.totalCents)}</strong>:
            bazė {formatCents(keltoIvertis.baseCents)} + BAF/GIR/ETS {formatCents(keltoIvertis.surchargeCents)} ({keltoIvertis.surcharge.month}).
          </p> : <p role="alert" className="mt-3 text-sm text-bad">
            Šiam maršrutui arba ilgiui automatinio tarifo nėra. Kelto kainą įrašykite ranka.
          </p>}
          <p className="mt-2 text-xs text-muted">
            Scandlines viešas tarifas, be PVM; sutartinė kaina gali skirtis.{" "}
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
        {routeLookup && marsrutoLinija.length >= 2 && <div className="mt-3">
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

      {/* Ką keisti reikia retai: numatytosios reikšmės tinka daugumai krovinių,
          o vieno ekrano pasiūlymui viršuje lieka tik penki laukai ir užsakovas. */}
      <Skiltis numeris={2} antraste="Kaip vertinti">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Krovinio svorio niekas kitas žinoti negali, o kurui jis svarbus:
              20 t ir 5 t skiriasi trečdaliu kuro (#86). */}
          {routeLookup && <label>Krovinio svoris, t<input type="text" inputMode="decimal" value={krovinioSvoris} onChange={(event) => setKrovinioSvoris(event.target.value)} placeholder="20" className={inputClass} /></label>}
          {/* Marža kainos skaičiavimui, ne formos laukas: `stopPropagation`,
              kad jos keitimas nenuvalytų jau parodyto rezultato. */}
          <label>Tikslinė marža (%)<input type="number" step="0.5" min="0" value={norimaMarza} onChange={(event) => { event.stopPropagation(); setNorimaMarza(event.target.value); }} className={inputClass} /></label>
          {/* Su kuo lyginamas krovinys: išsaugoma su reisu (0023), numatyta – fura stovėtų. */}
          <label>Alternatyva: paros<input type="text" inputMode="decimal" value={altParos} onChange={(event) => { event.stopPropagation(); setAltParos(event.target.value); }} className={inputClass} />
            <span className="mt-1 block text-xs text-muted">Kiek parų fura užimtų, jei šio krovinio neimtume. 0 – stovėtų.</span></label>
          <label>Alternatyva: įnašas (€)<input type="text" inputMode="decimal" value={altInasas} onChange={(event) => { event.stopPropagation(); setAltInasas(event.target.value); }} className={inputClass} />
            <span className="mt-1 block text-xs text-muted">Grįžimas tuščiam – su minusu: kuras + keliai.</span></label>
          {routeLookup && <label>Pakrovimas / iškrovimas, val. vienam<input type="text" inputMode="decimal" value={krovimoVal} onChange={(event) => { event.stopPropagation(); setKrovimoVal(event.target.value); }} className={inputClass} /></label>}
          {/* Du vairuotojai sutrumpina reisą parą ar dvi – o paros yra didžioji kaštų dalis. */}
          {routeLookup && <label>Vairavimas
            <select value={scenarijus} onChange={(event) => setScenarijus(event.target.value as DriverScenario)} className={inputClass}>
              {DRIVER_SCENARIOS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>}
        </div>
      </Skiltis>

      <Skiltis numeris={3} antraste="Kada ir kiek">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label>Reiso nr.<input name="trip_number" type="text" defaultValue={defaults.trip_number ?? ""} className={inputClass} /></label>
          <label>Išvykimo laikas<input name="departure_time" type="time" defaultValue="08:00" className={inputClass} /></label>
          {/* Jei vairuotojas jau vairavo, pirmas poilsis ateina anksčiau – keičia paras. */}
          {routeLookup && <label>Vairuotojas jau vairavo, val.<input type="text" inputMode="decimal" value={jauVairavo} onChange={(event) => setJauVairavo(event.target.value)} placeholder="0" className={inputClass} /></label>}
          {apimtiesFields.map(([name, label, step]) => <label key={name}>{label}<input name={name} type="number" min={name === "days" ? 0.001 : 0} max={name === "days" ? 2147483647 : undefined} step={step} required className={inputClass} defaultValue={defaults[name] ?? (name === "empty_km" ? "0" : undefined)} onChange={name === "days" ? () => setDienuSaltinis(null) : name === "empty_km" ? (event) => {
            const value = event.currentTarget.value.trim();
            const km = Number(value);
            tusciKmRanka.current = value !== "" && Number.isFinite(km) && km >= 0 ? km : null;
            // Maršruto atkarpa „Nemokami“ turi sutapti su visais km – kitaip skaičiavimas atmestų formą.
            const paid = Number((formRef.current?.elements.namedItem("paid_km") as HTMLInputElement | null)?.value);
            if (tusciKmRanka.current !== null && Number.isFinite(paid) && legs.length === 1 && legs[0].country === "Nemokami") {
              setLegs([{ ...legs[0], km: String(Math.round((paid + tusciKmRanka.current) * 100) / 100) }]);
            }
          } : undefined} />
            {name === "days" && dienuSaltinis && <span className="mt-1 block text-sm text-muted">
              {dienuSaltinis.source === "schedule" ? "Iš PTV vairavimo laiko plano." : "Apytiksliai pagal kelio valandas – plano nėra."}
              {dienuSaltinis.stale && <strong className="text-warn"> Maršrutas pakeistas – paspauskite „Skaičiuoti kainą“ iš naujo.</strong>}
            </span>}
          </label>)}
        </div>
      </Skiltis>

      <Skiltis numeris={4} antraste="Kiek išleis">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kastuFields.map(([name, label, step]) => <label key={name}>{label}<input name={name} type="number" min="0" step={step} required className={inputClass} defaultValue={defaults[name] ?? (name.startsWith("adblue") ? "0" : undefined)} onChange={name === "fuel_l_per_100km" ? (event) => { kuroRanka.current = event.currentTarget.value.trim() !== ""; } : undefined} /></label>)}
          {extras.map(([name, label]) => <label key={name}>{label}<input name={name} type="text" inputMode="decimal" required defaultValue={defaults[name] ?? "0"} className={inputClass} /></label>)}
        </div>
        {normos && <p role="status" className="mt-2 text-sm text-muted">{normos}</p>}
        {/* Vienintelis paaiškinimas, kurį verta palikti: be jo žmogus ieško,
            kur įvesti vairuotojo atlyginimą, ir gali jį įskaičiuoti dukart. */}
        <p className="mt-3 text-sm text-muted">Vairuotojas, draudimas ir nusidėvėjimas – jau furos paros savikainoje.</p>
      </Skiltis>

      <Skiltis numeris={5} antraste="Kiek gaus">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Pati kaina – viršuje; čia tik kaip ji skaičiuojama. */}
          <label>Pajamų būdas<select className={inputClass} value={mode} onChange={e => setMode(e.target.value)}><option value="freight">Frachto kaina</option><option value="per_km">Įkainis už apmokamą km</option></select></label>
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
      {zurnaloIspejimas && <p className="text-sm text-warn">{zurnaloIspejimas}</p>}

      {/* Rezultatas iškart po mygtukais: anksčiau jis būdavo už jų, ir
          paspaudus „Skaičiuoti" tekdavo slinkti žemyn pažiūrėti, kas išėjo. */}
      {result && <section aria-label="Reiso rezultatai" className="rounded-lg border border-line-strong bg-surface p-4">
        {/* Pagrindinis klausimas – imti ar ne. Žemiausia kaina – savikaina; žemiau
            jos tik su vadovo pritarimu, jei krovinys padengia kintamus kaštus. */}
        {inasas ? <div className={`mb-4 rounded-lg border-2 bg-page p-3 ${!verdiktas ? "border-line" : verdiktas.kind === "take" ? "border-good" : verdiktas.kind === "negotiate" ? "border-warn" : "border-bad"}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className={`text-xl font-semibold ${!verdiktas ? "" : verdiktas.kind === "take" ? "text-good" : verdiktas.kind === "negotiate" ? "text-warn" : "text-bad"}`}>
              {!verdiktas ? "Tinkama krovinio kaina" : verdiktas.kind === "take" ? "Imti" : verdiktas.kind === "negotiate" ? `Derėtis iki ${sveikiEurai(verdiktas.targetPriceCents)}` : "Neimti"}
            </h2>
            {/* Fura uždirba paromis: įnašas per parą leidžia palyginti trumpą ir ilgą krovinį. */}
            <p className="text-2xl font-semibold tabular-nums">
              {!verdiktas
                ? (prasomaKaina === null ? "—" : formatCents(prasomaKaina))
                : <>{verdiktas.contributionPerDayCents === null ? "—" : formatCents(verdiktas.contributionPerDayCents)} <span className="text-sm font-normal text-muted">įnašas per parą</span></>}
            </p>
          </div>
          {bePajamu
            ? <>
              {/* Kaina išdėstoma taip, kaip ją pateikia įmonė: baseline rate ir kuras atskirai. */}
              <p className="mt-1 text-xs tabular-nums text-muted">
                {kaina === null
                  ? "Tikslinė marža – nuo 0 iki 99,9 %."
                  : <>Baseline rate {formatCents(kaina.baselineRateCents)} + kuras {formatCents(kaina.fuelCents)} · {norimaMarza} % marža, pelnas {formatCents(kaina.profitCents)}</>}
              </p>
              {/* Žemiausia kaina – savikaina be antkainio; žemiau jos skaičiaus nesiūlome:
                  tai sprendžiama pagal aplinkybes, vadovui pritarus. */}
              <p className="mt-2 text-sm">Mažiausiai – savikaina <strong className="tabular-nums">{formatCents(result.totalCostCents)}</strong> (be antkainio). Žemiau – tik įvertinus aplinkybes, vadovui pritarus.</p>
            </>
            : verdiktas && <>
              {/* Viena smulki eilutė – viskas, ko reikia sprendimui; pilnas pelnas antraeilis. */}
              <p className="mt-1 text-sm tabular-nums text-muted">
                Įnašas {formatCents(inasas.contributionCents)} · {skaicius(paros)} par. · tušti {skaicius(tusciKm)} km
                {" "}· pilnas pelnas <span className={result.profitCents >= 0 ? "" : "text-bad"}>{formatCents(result.profitCents)}</span>
              </p>
              {verdiktas.kind !== "take" && verdiktas.increasePercent !== null && <p className={`mt-1 text-sm ${verdiktas.kind === "negotiate" ? "text-warn" : "text-bad"}`}>
                Savikaina {formatCents(result.totalCostCents)} – reikia {verdiktas.increasePercent.toFixed(1).replace(".", ",")} % daugiau nei siūloma
                {verdiktas.kind === "negotiate" ? ` (riba ${skaicius(verdiktas.bandPercent)} %).` : `, o derėtis verta iki ${skaicius(verdiktas.bandPercent)} %.`}
              </p>}
              {/* Įmonės taisyklė (#248): žemiau savikainos – tik vadovui pritarus, ir tik kai geriau už alternatyvą. */}
              {verdiktas.approvalPossible && <p className="mt-1 text-sm text-muted">
                Pigiau nei {sveikiEurai(verdiktas.targetPriceCents)} – tik vadovui pritarus: krovinys {formatCents(inasas.vsAlternativeCents)} geresnis už alternatyvą.
              </p>}
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-muted">Kaip suskaičiuota</summary>
                <p className="mt-2 tabular-nums text-muted">
                  Pajamos {formatCents(result.revenueCents)} − kuras {formatCents(result.fuelCents)} − AdBlue {formatCents(result.adblueCents)} − keliai {formatCents(result.roadCents)}
                  {" "}− dienpinigiai {formatCents(inasas.perDiemExtraCents)} už {skaicius(inasas.extraDays)} papildomas par. iš {skaicius(paros)}
                  {" "}= <strong className="text-ink">{formatCents(inasas.contributionCents)}</strong> įnašas.
                  {" "}Kuras, AdBlue ir keliai – su tuščiais km.
                </p>
                <p className="mt-1 tabular-nums text-muted">
                  Alternatyva: {formatCents(alternatyva!.contributionCents)} per {skaicius(alternatyva!.days)} par.
                  {" "}· skirtumas <strong className="text-ink">{formatCents(inasas.vsAlternativeCents)}</strong>
                  {" "}· įmonės riba {formatCents(alternatyva!.thresholdCents)}
                </p>
                <p className="mt-1 tabular-nums text-muted">
                  Pilnas pelnas (su pastoviais furos kaštais) {formatCents(result.profitCents)} · marža {result.marginPercent === null ? "—" : `${result.marginPercent.toFixed(1)} %`}
                  {/* Lėtas krovinys už km atrodo gerai, bet fura uždirba paromis (#179). */}
                  {result.profitPerDayCents !== null && ` · ${formatCents(result.profitPerDayCents)} per parą`}
                </p>
              </details>
            </>}
        </div> : <p role="alert" className="mb-4 text-sm text-bad">Alternatyvos laukai neteisingi: paros – neneigiamas skaičius, sumos – eurais.</p>}
        {/* Pasiūlymų žurnalas (Phase 0, 5): ką nusprendė dispečeris prie Bramit verdikto.
            `stopPropagation` – šie laukai ne reiso dalis ir rezultato nenuvalo. */}
        {!tripId && verdiktas && <div className="mb-4 rounded-lg border border-line p-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <label>Galutinė kaina, €<input type="text" inputMode="decimal" value={galutineKaina} onChange={(event) => { event.stopPropagation(); setGalutineKaina(event.target.value); }} placeholder="Neprivaloma" className={inputClass} /></label>
            <label>Priežastis<select value={priezastis} onChange={(event) => { event.stopPropagation(); setPriezastis(event.target.value); }} className={inputClass}>
              <option value="">—</option>
              {QUOTE_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
            </select></label>
            {priezastis === "Kita" && <label>Kokia<input type="text" maxLength={500} value={priezastiesTekstas} onChange={(event) => { event.stopPropagation(); setPriezastiesTekstas(event.target.value); }} className={inputClass} /></label>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(["taken", "negotiating", "declined"] as const).map((decision) => (
              <button key={decision} type="button" disabled={!zurnaloId} onClick={() => void saveDecision(decision)}
                className={`rounded-md border px-3 py-1.5 font-medium disabled:opacity-50 ${sprendimas === decision ? "border-accent bg-accent text-accent-ink" : "border-line"}`}>
                {DECISION_LABELS[decision]}
              </button>
            ))}
            <span className="text-muted">
              {sprendimas !== "pending" ? `Žurnale: ${DECISION_LABELS[sprendimas]}. ` : zurnaloId ? "Įrašyta į žurnalą. " : ""}
              <Link href="/pasiulymai" className="underline">Visi pasiūlymai</Link>
            </span>
          </div>
          {sprendimoKlaida && <p role="alert" className="mt-2 text-bad">{sprendimoKlaida}</p>}
        </div>}
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
        {bePajamu && kainaZemiauRibos && <p role="alert" className="mt-3 rounded-lg bg-bad-soft p-3 text-sm text-bad">
          Tikslinė marža {norimaMarza} % žemesnė už įmonės ribą {formatMinMargin(minMarza)}.
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
              [`Tinkama kaina (${norimaMarza} % marža)`, prasomaKaina, true],
              ...(bePajamu ? [] : [["Pajamos", result.revenueCents, false]]),
            ] as [string, number | null, boolean][]).map(([label, cents, target]) => {
              const perDay = cents === null ? null : pricePerDay(cents, paros);
              const perKm = cents === null ? null : pricePerKm(cents, apmokamiKm);
              return <tr key={label} className="border-t border-line">
                <th scope="row" className="py-1 pr-3 text-left font-normal">
                  {label}
                  {target && !bePajamu && kainaZemiauRibos && <span className="block text-xs text-bad">žemiau įmonės ribos {formatMinMargin(minMarza)}</span>}
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
