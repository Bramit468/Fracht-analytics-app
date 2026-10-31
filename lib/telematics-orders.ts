/**
 * Telematikos užsakymai → reisai.
 *
 * Užsakymas (Orders) turi kainą ir užsakovą, o kelionės (Trips) – iš ko jis
 * susideda: atkarpas su laiku, vietomis, vilkiku ir km. Jungiama per `OrderId`.
 *
 * Kas iš kur:
 * - pajamos – užsakymo kaina + priemokos;
 * - paros – valandos / 24. Tos pačios furos persidengiantys užsakymai
 *   laiką dalijasi: kitaip paros kaštai būtų priskaičiuoti dukart;
 * - km – atkarpų suma, tuščios atkarpos atskirai. Maždaug pusės užsakymų
 *   pakrautos atkarpos Telematikoje be km (nei atstumo, nei odometro): jiems
 *   importuojant km skaičiuoja PTV per atkarpų adresus (`kmAddresses`), o
 *   peržiūrai – įvertis iš paros ridos pagal užsakymo valandų dalį;
 * - keliai – tikri pirkimai, paskirstyti tą dieną važiavusiems tos furos
 *   užsakymams pagal jų valandas tą dieną;
 * - kuro ir AdBlue normos bei kainos – tos furos faktas per užsakymo laiką.
 *
 * Neimportuojama (ir pasakoma kodėl): dar vykstantys ir neįkainoti (0 €)
 * užsakymai, samdytas vežėjas, nežinoma fura.
 */

import { countriesByDayFromStops, fitPerDiemDays, perDiemCentsFor, perDiemDays } from "./per-diem";
import { iso2FromIso3 } from "./per-diem-norms";
import { addDays } from "./trip-progress";
import { plateKey, summarizeActuals, tripFillFromActuals, type DailyDistance, type Supply } from "./telematics-costs";
import type { StoredStop, StopType } from "./stops";
import type { TripCountryLegInsert, TripInsert } from "../types/trip";

export interface TelematikaOrder {
  orderId: string;
  orderNo: string;
  client: string | null;
  /** Kaina + priemokos, centais. */
  priceCents: number;
}

export interface OrderLeg {
  orderId: string;
  /** „2026-10-21 09:00:00“ – tiekėjo vietinis laikas, be zonos. */
  start: string;
  end: string;
  startPlace: string;
  endPlace: string;
  startType: string | null;
  endType: string | null;
  km: number;
  empty: boolean;
  plate: string | null;
  external: boolean;
  /** Sunaudoti litrai; 0 – dar nevažiuota arba daviklio nėra. */
  fuelL: number;
}

function text(value: unknown): string | null {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed === "" ? null : trimmed;
}

function decimal(value: unknown): number {
  const number = typeof value === "number" ? value : Number(text(value));
  return Number.isFinite(number) ? number : 0;
}

export function parseOrders(payload: unknown): Map<string, TelematikaOrder> {
  if (!Array.isArray(payload)) throw new Error("Orders atsakymas turi būti sąrašas.");
  const orders = new Map<string, TelematikaOrder>();
  for (const row of payload as Record<string, unknown>[]) {
    const orderId = text(row?.OrderId);
    if (!orderId) continue;
    orders.set(orderId, {
      orderId,
      orderNo: text(row.OrderNo) ?? "",
      client: text(row.TripClient),
      priceCents: Math.round((decimal(row.OrderPrice) + decimal(row.AdditionalPaymentsEur)) * 100),
    });
  }
  return orders;
}

export function parseOrderLegs(payload: unknown): OrderLeg[] {
  if (!Array.isArray(payload)) throw new Error("Trips atsakymas turi būti sąrašas.");
  const legs: OrderLeg[] = [];
  for (const row of payload as Record<string, unknown>[]) {
    const orderId = text(row?.OrderId);
    const start = text(row?.DateStart);
    const end = text(row?.DateEnd);
    if (!orderId || !start || !end) continue;
    legs.push({
      orderId,
      start,
      end,
      startPlace: text(row.StartPlace) ?? "",
      endPlace: text(row.EndPlace) ?? "",
      startType: text(row.StartPointType),
      endType: text(row.EndPointType),
      km: decimal(row.Distance),
      empty: text(row.IsEmptyKm) === "1",
      plate: text(row.TruckPlates) ?? text(row.Number),
      external: text(row.ExternalCarrier) !== null,
      fuelL: decimal(row.FuelConsumption),
    });
  }
  return legs;
}

/** Telematikos vieta: „Pavadinimas, SWE, Linköping, 582 75, Gatvė 5“. */
function placeParts(place: string): { country: string; city: string; postcode: string; street: string } | null {
  const parts = place.split(",").map((part) => part.trim());
  const index = parts.findIndex((part, i) => i > 0 && /^[A-Z]{3}$/.test(part));
  if (index === -1) return null;
  return { country: parts[index], city: parts[index + 1] ?? "", postcode: parts[index + 2] ?? "", street: parts.slice(index + 3).join(", ") };
}

/** Adresas PTV paieškai – be įmonės pavadinimo, kuris paiešką tik painioja. */
export function placeQuery(place: string): string {
  const parts = placeParts(place);
  if (!parts) return place;
  const town = [parts.postcode, parts.city].filter(Boolean).join(" ");
  return [parts.street, town, parts.country].filter(Boolean).join(", ");
}

/** „Pavadinimas, SWE, Linköping, 582 75, Gatvė 5“ → „Linköping, SWE“. */
export function placeCity(place: string): string {
  const parts = placeParts(place);
  if (!parts) return place.split(",")[0].trim();
  return parts.city ? `${parts.city}, ${parts.country}` : parts.country;
}

const HOUR = 3_600_000;
/** Kiek dienų į priekį ieškoti užsakymo, kuriam priskirti kelius iš dienos be užsakymo. */
const NEXT_ORDER_DAYS = 3;

/** Tiekėjo laikas be zonos – visur skaitomas vienodai, kaip UTC. */
function time(value: string): number {
  return Date.parse(`${value.replace(" ", "T")}Z`);
}

function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export interface OrderTime {
  hours: number;
  /** Valandos pagal dieną – kelių mokesčiams paskirstyti. */
  byDay: Map<string, number>;
}

/**
 * Tos pačios furos laikas tarp užsakymų: kiekviena valanda padalinama
 * tuo metu aktyviems užsakymams po lygiai. Taip parų suma niekada neviršija
 * laiko, kurį fura iš tikrųjų dirbo.
 */
export function allocateTime(intervals: { id: string; truck: string; start: number; end: number }[]): Map<string, OrderTime> {
  const result = new Map<string, OrderTime>(intervals.map((item) => [item.id, { hours: 0, byDay: new Map() }]));
  const byTruck = new Map<string, typeof intervals>();
  for (const item of intervals) {
    if (!(item.end > item.start)) continue;
    (byTruck.get(item.truck) ?? byTruck.set(item.truck, []).get(item.truck)!).push(item);
  }

  for (const items of byTruck.values()) {
    const points = new Set<number>();
    for (const { start, end } of items) {
      points.add(start).add(end);
      // Vidurnakčiai – kad atkarpa niekada nekirstų dienos ribos.
      for (let day = Math.floor(start / (24 * HOUR)) + 1; day * 24 * HOUR < end; day++) points.add(day * 24 * HOUR);
    }
    const sorted = [...points].sort((a, b) => a - b);
    for (let i = 0; i + 1 < sorted.length; i++) {
      const [from, to] = [sorted[i], sorted[i + 1]];
      const active = items.filter((item) => item.start < to && item.end > from);
      if (active.length === 0) continue;
      const share = (to - from) / HOUR / active.length;
      for (const item of active) {
        const entry = result.get(item.id)!;
        entry.hours += share;
        entry.byDay.set(dayOf(from), (entry.byDay.get(dayOf(from)) ?? 0) + share);
      }
    }
  }
  return result;
}

function stopType(type: string | null, fallback: StopType): StopType {
  if (type === "Loading") return "loading";
  if (type === "Unloading" || type === "Loaded unloading") return "unloading";
  if (type === "Changing") return "other";
  return fallback;
}

/** Sustojimai iš atkarpų: pirmas – pakrovimas, paskutinis – iškrovimas, kaip reiso formoje. */
function stopsOf(legs: OrderLeg[]): StoredStop[] {
  const loaded = legs.filter((leg) => !leg.empty);
  const route = loaded.length > 0 ? loaded : legs;
  const stops: StoredStop[] = [{ type: "loading", address: route[0].startPlace, point: "" }];
  for (const leg of route) {
    stops.push({ type: stopType(leg.endType, "other"), address: leg.endPlace, point: "" });
  }
  stops[stops.length - 1].type = "unloading";
  // Tarpiniai pakrovimai ir iškrovimai – „papildomi", kaip juos žymi forma.
  for (const stop of stops.slice(1, -1)) {
    if (stop.type === "loading") stop.type = "extra_loading";
    if (stop.type === "unloading") stop.type = "extra_unloading";
  }
  return stops;
}

export interface ImportTruck {
  id: string;
  plate: string;
  fuel_norm_l_per_100km?: number | null;
  adblue_norm_l_per_100km?: number | null;
}

export interface ImportedTrip {
  orderId: string;
  customer: string | null;
  trip: Omit<TripInsert, "customer_id">;
  legs: TripCountryLegInsert[];
  plate: string;
  start: string;
  end: string;
  /** Ką teko spėti – rodoma peržiūroje. */
  notes: string[];
  /**
   * Pakrautų atkarpų adresai PTV maršrutui, kai Telematikoje jų km nėra.
   * `null` – km yra. Importuojant PTV km pakeičia `paid_km` įvertį.
   */
  kmAddresses: string[] | null;
}

export interface SkippedOrder {
  orderId: string;
  orderNo: string;
  reason: string;
}

export interface OrderImport {
  trips: ImportedTrip[];
  skipped: SkippedOrder[];
  /** Kelių mokesčiai dienomis, kai fura nevežė jokio užsakymo – nepriskirti. */
  unassignedTollCents: number;
}

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

/** Parko vidutinė kaina už litrą – kai fura per užsakymą nepirko. */
function fleetPrice(supplies: Supply[], kind: "diesel" | "adblue"): number | null {
  const rows = supplies.filter((row) => row.kind === kind && (row.quantity ?? 0) > 0);
  const litres = rows.reduce((total, row) => total + (row.quantity ?? 0), 0);
  return litres > 0 ? rows.reduce((total, row) => total + row.costCents, 0) / 100 / litres : null;
}

export function buildOrderTrips(input: {
  orders: Map<string, TelematikaOrder>;
  legs: OrderLeg[];
  trucks: ImportTruck[];
  daily: DailyDistance[];
  supplies: Supply[];
  /** „2026-10-23 12:00:00“ – nebaigti užsakymai praleidžiami. */
  now: string;
  /** Įmonės dienpinigių % pagal šalis; `null` – lieka fiksuota furos suma. */
  perDiemPercent?: number | null;
}): OrderImport {
  const trucks = new Map(input.trucks.map((truck) => [plateKey(truck.plate), truck]));
  const byOrder = new Map<string, OrderLeg[]>();
  for (const leg of input.legs) (byOrder.get(leg.orderId) ?? byOrder.set(leg.orderId, []).get(leg.orderId)!).push(leg);

  const skipped: SkippedOrder[] = [];
  const ready: { orderId: string; order: TelematikaOrder; legs: OrderLeg[]; truck: ImportTruck }[] = [];
  const nowMs = time(input.now);

  for (const [orderId, legs] of byOrder) {
    legs.sort((a, b) => a.start.localeCompare(b.start));
    const order = input.orders.get(orderId);
    const orderNo = order?.orderNo ?? "";
    const skip = (reason: string) => skipped.push({ orderId, orderNo, reason });
    if (!order) { skip("Užsakymo nėra Orders sąraše."); continue; }
    if (legs.some((leg) => leg.external)) { skip("Vežė samdytas vežėjas."); continue; }
    if (time(legs[legs.length - 1].end) > nowMs) { skip("Dar vyksta."); continue; }
    if (order.priceCents <= 0) { skip("Kaina 0 € – dar neįkainotas."); continue; }
    const plates = new Set(legs.map((leg) => leg.plate && plateKey(leg.plate)).filter(Boolean));
    const plate = legs.find((leg) => leg.plate)?.plate ?? null;
    if (!plate) { skip("Kelionėse nenurodyta fura."); continue; }
    if (plates.size > 1) { skip("Užsakymą vežė kelios furos."); continue; }
    const truck = trucks.get(plateKey(plate));
    if (!truck) { skip(`Furos ${plate} nėra sąraše.`); continue; }
    ready.push({ orderId, order, legs, truck });
  }

  const allocated = allocateTime(ready.map(({ orderId, legs, truck }) => ({
    id: orderId,
    truck: truck.id,
    start: time(legs[0].start),
    end: time(legs[legs.length - 1].end),
  })));

  /**
   * Kuriems tos furos užsakymams ir kokia dalimi tenka ta diena (pagal valandas).
   * `wholeDay` – dalis nuo visos paros (≥ 24 h): rida važiuojama ir be užsakymo,
   * todėl 6 val. užsakymas negauna visos dienos km. Keliams – nuo užsakymų
   * valandų: mokama tik važiuojant, o važiuojama vežant.
   */
  const dayShares = (plate: string, date: string, wholeDay = false): { id: string; share: number }[] => {
    const truck = trucks.get(plateKey(plate));
    const sharing = ready
      .filter((item) => item.truck.id === truck?.id)
      .map((item) => ({ id: item.orderId, hours: allocated.get(item.orderId)?.byDay.get(date) ?? 0 }))
      .filter((item) => item.hours > 0);
    const hours = sharing.reduce((sum, item) => sum + item.hours, 0);
    const total = wholeDay ? Math.max(hours, 24) : hours;
    return sharing.map((item) => ({ id: item.id, share: item.hours / total }));
  };

  /**
   * Kitas tos furos užsakymas, prasidedantis per `NEXT_ORDER_DAYS` po `date`.
   * Diena be užsakymo dažniausiai yra pervažiavimas į pakrovimą – jį apmoka
   * kitas užsakymas, ne niekas.
   */
  const nextOrder = (plate: string, date: string): string | null => {
    const truck = trucks.get(plateKey(plate));
    const limit = addDays(date, NEXT_ORDER_DAYS);
    let best: (typeof ready)[number] | null = null;
    for (const item of ready) {
      const day = item.legs[0].start.slice(0, 10);
      if (item.truck.id !== truck?.id || day <= date || day > limit) continue;
      if (!best || item.legs[0].start < best.legs[0].start) best = item;
    }
    return best?.orderId ?? null;
  };

  // Kelių mokesčiai: kiekvienas pirkimas tenka tą dieną tos furos važiavusiems
  // užsakymams pagal jų valandas tą dieną; dienos be užsakymų – kitam tos furos
  // užsakymui. Nepriskirtais laikomi tik kelionių laikotarpio pirkimai –
  // pirkimų srautas siekia 3 mėn., kelionių – vieną.
  const firstDay = ready.reduce((min, item) => (item.legs[0].start < min ? item.legs[0].start : min), "9999").slice(0, 10);
  const lastDay = ready.reduce((max, item) => (item.legs[item.legs.length - 1].end > max ? item.legs[item.legs.length - 1].end : max), "").slice(0, 10);
  const tollCents = new Map<string, number>();
  // Keltai skirstomi taip pat kaip keliai, bet į savo lauką „Keltai“.
  const ferryCents = new Map<string, number>();
  /** Kiek kelių atkelta iš dienų be užsakymo – reiso pastabai. */
  const carriedTollCents = new Map<string, number>();
  let unassignedTollCents = 0;
  for (const supply of input.supplies) {
    if ((supply.kind !== "toll" && supply.kind !== "ferry") || supply.date < firstDay || supply.date > lastDay) continue;
    const target = supply.kind === "ferry" ? ferryCents : tollCents;
    const shares = dayShares(supply.plate, supply.date);
    if (shares.length === 0) {
      const next = nextOrder(supply.plate, supply.date);
      if (!next) { unassignedTollCents += supply.costCents; continue; }
      target.set(next, (target.get(next) ?? 0) + supply.costCents);
      carriedTollCents.set(next, (carriedTollCents.get(next) ?? 0) + supply.costCents);
      continue;
    }
    for (const { id, share } of shares) target.set(id, (target.get(id) ?? 0) + supply.costCents * share);
  }

  // Paros rida – užsakymams, kurių atkarpos Telematikoje be km.
  const estimatedKm = new Map<string, number>();
  for (const day of input.daily) {
    if (day.km <= 0 || day.date < firstDay || day.date > lastDay) continue;
    for (const { id, share } of dayShares(day.plate, day.date, true)) estimatedKm.set(id, (estimatedKm.get(id) ?? 0) + day.km * share);
  }

  const fleetFuel = fleetPrice(input.supplies, "diesel");
  const fleetAdblue = fleetPrice(input.supplies, "adblue");

  const trips = ready.map(({ orderId, order, legs, truck }): ImportedTrip => {
    const notes: string[] = [];
    const carried = carriedTollCents.get(orderId);
    if (carried) notes.push(`Keliai ${(carried / 100).toFixed(2).replace(".", ",")} € – pervažiavimas prieš užsakymą (dienos be užsakymo).`);
    const start = legs[0].start;
    const end = legs[legs.length - 1].end;
    let paidKm = round(legs.filter((leg) => !leg.empty).reduce((sum, leg) => sum + leg.km, 0), 2);
    const emptyKm = round(legs.filter((leg) => leg.empty).reduce((sum, leg) => sum + leg.km, 0), 2);
    const loadedLegs = legs.filter((leg) => !leg.empty);
    let kmAddresses: string[] | null = null;
    if (paidKm === 0) {
      // Pakrautų atkarpų km Telematikoje nėra: peržiūrai – kas lieka iš paros
      // ridos po tuščių, importuojant – PTV maršrutas per tuos pačius adresus.
      paidKm = round(Math.max(0, (estimatedKm.get(orderId) ?? 0) - emptyKm), 2);
      const route = loadedLegs.length > 0 ? loadedLegs : legs;
      kmAddresses = [route[0].startPlace, ...route.map((leg) => leg.endPlace)].map(placeQuery);
      notes.push("Km Telematikoje nėra – importuojant skaičiuos PTV (dabar įvertis iš paros ridos).");
    }
    const totalKm = paidKm + emptyKm;

    const fill = tripFillFromActuals(summarizeActuals(input.daily, input.supplies, truck.plate, start.slice(0, 10), end.slice(0, 10)));
    // Atkarpų kuras tikslesnis už paros eilutes: jis tik šio užsakymo.
    const legFuel = legs.every((leg) => leg.km === 0 || leg.fuelL > 0) ? legs.reduce((sum, leg) => sum + leg.fuelL, 0) : 0;
    let fuelPer100 = totalKm > 0 && legFuel > 0 ? (legFuel / totalKm) * 100 : Number(fill.fuel_l_per_100km) || 0;
    if (fuelPer100 === 0 && truck.fuel_norm_l_per_100km) { fuelPer100 = truck.fuel_norm_l_per_100km; notes.push("Kuro norma – iš furos kortelės."); }
    if (fuelPer100 === 0 && totalKm > 0) notes.push("Kuro sąnaudų nėra – kuras 0.");
    let fuelPrice = Number(fill.fuel_price) || 0;
    if (fuelPrice === 0 && fleetFuel !== null) { fuelPrice = fleetFuel; notes.push("Kuro kaina – parko vidurkis."); }
    let adbluePer100 = Number(fill.adblue_l_per_100km) || 0;
    if (adbluePer100 === 0 && truck.adblue_norm_l_per_100km) adbluePer100 = truck.adblue_norm_l_per_100km;
    let adbluePrice = Number(fill.adblue_price) || 0;
    if (adbluePrice === 0 && fleetAdblue !== null) adbluePrice = fleetAdblue;

    const hours = allocated.get(orderId)?.hours ?? 0;
    const days = Math.max(0.01, round(hours / 24, 3));
    const route = loadedLegs.length > 0 ? loadedLegs : legs;

    // Dienpinigiai pagal pakrovimo ir iškrovimo šalis (#187). Tranzito šalių
    // Telematika neduoda – dienos be sustojimų skaičiuojamos pagal kitą sustojimą.
    let perDiem: Pick<TripInsert, "per_diem_cents" | "per_diem_days"> = {};
    if (input.perDiemPercent != null) {
      const stops = legs.flatMap((leg) => [{ at: leg.start, place: leg.startPlace }, { at: leg.end, place: leg.endPlace }])
        .map((stop) => ({ at: stop.at, code: placeParts(stop.place)?.country ?? "" }));
      const unknown = [...new Set(stops.filter((stop) => !iso2FromIso3(stop.code)).map((stop) => stop.code || "be šalies"))];
      if (unknown.length > 0) {
        notes.push(`Dienpinigiai fiksuoti: šaliai ${unknown.join(", ")} normos nėra.`);
      } else {
        const byDay = countriesByDayFromStops(stops.map((stop) => ({ at: stop.at, country: iso2FromIso3(stop.code)! })));
        const fitted = fitPerDiemDays(perDiemDays(byDay, input.perDiemPercent).days, Math.ceil(days));
        perDiem = { per_diem_cents: perDiemCentsFor(fitted, days), per_diem_days: fitted };
      }
    }

    return {
      orderId,
      kmAddresses,
      customer: order.client,
      plate: truck.plate,
      start,
      end,
      notes,
      legs: [{ country: "Nemokami", km: round(totalKm, 2) }],
      trip: {
        trip_number: (order.orderNo || `TLM ${orderId}`).slice(0, 120),
        origin: placeCity(route[0].startPlace),
        destination: placeCity(route[route.length - 1].endPlace),
        trip_date: start.slice(0, 10),
        truck_id: truck.id,
        days,
        paid_km: paidKm,
        empty_km: emptyKm,
        fuel_l_per_100km: round(fuelPer100, 4),
        fuel_price: round(fuelPrice, 4),
        adblue_l_per_100km: round(adbluePer100, 4),
        adblue_price: round(adbluePrice, 4),
        // Tikri sumokėti keliai, kaip ir telematikos užpildyme: atkarpa „Nemokami".
        bridges_cents: Math.round(tollCents.get(orderId) ?? 0),
        ferries_cents: Math.round(ferryCents.get(orderId) ?? 0),
        tunnels_cents: 0,
        parking_cents: 0,
        revenue_mode: "freight",
        rate_per_km: null,
        freight_price_cents: order.priceCents,
        stops: stopsOf(legs),
        telematika_order_id: orderId,
        ...perDiem,
      },
    };
  });

  trips.sort((a, b) => a.start.localeCompare(b.start));
  return { trips, skipped, unassignedTollCents: Math.round(unassignedTollCents) };
}

/** Importuoto reiso laukai, pagal kuriuos sprendžiama, ar užsakymas pasikeitė. */
export type StoredOrderTrip = Pick<TripInsert, "trip_date" | "truck_id" | "days" | "paid_km" | "empty_km" | "freight_price_cents" | "bridges_cents" | "per_diem_cents">;

/** Laukai, kuriais skiriasi du tos pačios reiso įrašo variantai. `paidKm: false` – km nelyginami. */
function fieldChanges(a: StoredOrderTrip, b: StoredOrderTrip, paidKm: boolean): string[] {
  const differs = (x: number | null | undefined, y: number | null | undefined, step: number) =>
    Math.abs(Number(x ?? 0) - Number(y ?? 0)) >= step;
  const changes: string[] = [];
  if (differs(a.freight_price_cents, b.freight_price_cents, 1)) changes.push("kaina");
  if (a.trip_date !== b.trip_date || differs(a.days, b.days, 0.001)) changes.push("datos");
  if (a.truck_id !== b.truck_id) changes.push("fura");
  if (differs(a.empty_km, b.empty_km, 0.01)) changes.push("tušti km");
  if (paidKm && differs(a.paid_km, b.paid_km, 0.01)) changes.push("km");
  if (differs(a.bridges_cents, b.bridges_cents, 1)) changes.push("keliai");
  // Ir anksčiau importuoti reisai be dienpinigių pagal šalis gauna juos per kitą atnaujinimą.
  if ((a.per_diem_cents ?? null) !== (b.per_diem_cents ?? null)) changes.push("dienpinigiai");
  return changes;
}

/**
 * Kas užsakyme pasikeitė nuo paskutinio importo. Tuščias sąrašas – įrašyti
 * nereikia: perrašymas be reikalo atnaujintų ir furos kaštų kopiją.
 *
 * Kuro normos nelyginamos – jos imamos iš to meto fakto ir svyruoja kas dieną.
 * Apmokami km nelyginami, kai juos skaičiuoja PTV (`kmAddresses`): įraše jau
 * PTV km, o čia – tik paros ridos įvertis.
 */
export function importChanges(stored: StoredOrderTrip, built: ImportedTrip): string[] {
  return fieldChanges(stored, built.trip, !built.kmAddresses);
}

/** Ką importas įrašė – saugoma `trips.import_snapshot` (0021). */
export function importSnapshot(trip: StoredOrderTrip): StoredOrderTrip {
  const { trip_date, truck_id, days, paid_km, empty_km, freight_price_cents, bridges_cents, per_diem_cents } = trip;
  return { trip_date, truck_id, days, paid_km, empty_km, freight_price_cents, bridges_cents, per_diem_cents: per_diem_cents ?? null };
}

/**
 * Ar importuotas reisas pataisytas ranka: įrašas skiriasi nuo to, ką importas
 * įrašė paskutinį kartą. Be kopijos (sena eilutė) – nežinoma, laikoma, kad ne.
 * Km lyginami visada: kopijoje jau tie km, kurie buvo įrašyti (ir PTV).
 */
export function editedByHand(stored: StoredOrderTrip, snapshot: StoredOrderTrip | null | undefined): string[] {
  return snapshot ? fieldChanges(stored, snapshot, true) : [];
}
