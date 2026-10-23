/**
 * Pokalbio asistento įrankiai („Klausk Bramit“).
 *
 * Modelis pats nieko neskaičiuoja: jis renkasi įrankį, o skaičius pateikia tos
 * pačios funkcijos, kurios piešia suvestinę ir lenteles. Taip atsakymas
 * negali išsiskirti su tuo, ką žmogus mato ekrane, ir modelio aritmetikos
 * klaida nevirsta neteisingu pelnu.
 *
 * Sumos grąžinamos jau suformatuotos („1 234,56 €“): centų perskaičiavimas
 * modelyje būtų dar viena vieta suklysti.
 */

import type { FunctionTool } from "openai/resources/responses/responses";

import { calcDailyRate, type CountryTariff } from "./calc";
import type { CompanySettings } from "./company-settings";
import { costInsights, fleetFuelPricePerL } from "./cost-insights";
import { summarizeCountryRoads } from "./country-roads";
import { calculateDashboardStats } from "./dashboard";
import { summarizeByCustomer, customerKey, type Customer } from "./customers";
import { emptyKmByTruck, summarizeEmptyKm } from "./empty-km";
import { fuelPricesByCountry, fuelPricesByMonth, savingsAtCheapestCents } from "./fuel-prices";
import { groupProfit, type ProfitGroup } from "./group-profit";
import { formatCents } from "./money";
import { tripMonth } from "./monthly";
import { paymentState, paymentStateText, summarizePayments } from "./payments";
import { summarizeByRoute } from "./route-profit";
import type { LiveTruck } from "./telematics";
import {
  actualsByTruck,
  plateKey,
  summarizeActuals,
  type ActualCosts,
  type DailyDistance,
  type Supply,
  type SupplyIssues,
} from "./telematics-costs";
import { truckRowToCalc } from "./truck";
import { documentAlerts, documentAlertText } from "./truck-profile";
import { summarizeByTruck } from "./truck-profit";
import { calculateSavedTrip } from "./trip-input";
import { addDays, isOnTheRoad, tripProgress } from "./trip-progress";
import { compareTripToActuals } from "./trip-variance";
import type { TripSummary } from "./trips";
import type { Trip, TripCountryLeg } from "../types/trip";
import type { Truck } from "../types/truck";

export interface AssistantData {
  trips: TripSummary[];
  /** Išsaugoti reisai su visais laukais – plano ir fakto palyginimui. */
  rawTrips: Trip[];
  legs: TripCountryLeg[];
  tariffs: CountryTariff[];
  customers: Customer[];
  trucks: Truck[];
  settings: CompanySettings;
  /** Šiandiena Vilniaus laiku, YYYY-MM-DD. */
  today: string;
}

/** Telematikos faktas: rida ir kuras iš skaitiklių, kaštai iš pirkimų. */
export interface TelematicsData {
  daily: DailyDistance[];
  /** Jau eurais (svetima valiuta perskaičiuota ECB kursu). */
  supplies: Supply[];
  issues: SupplyIssues;
}

export interface LiveData {
  trucks: LiveTruck[];
  withoutPosition: string[];
}

/**
 * Iš kur įrankiai ima duomenis. Telematika ir vietos – `null`, kai įmonei
 * neprijungta; tada įrankis taip ir atsako, o ne meta klaidą.
 */
export interface AssistantContext {
  data(): Promise<AssistantData>;
  telematics(): Promise<TelematicsData | null>;
  live(): Promise<LiveData | null>;
}

export interface TripFilter {
  from: string | null;
  to: string | null;
  plate: string | null;
  customer: string | null;
}

const MAX_ROWS = 30;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Klaida, kurią modelis gauna kaip įrankio atsakymą ir gali pasitaisyti. */
export class ToolInputError extends Error {}

// --- Formatavimas -----------------------------------------------------------

/** Lietuviškai: kablelis ir tikras minusas, kaip ir sumose („−100,00 €“). */
function decimal(value: number, places: number): string {
  return value.toFixed(places).replace(".", ",").replace("-", "−");
}

function percent(value: number | null): string | null {
  return value === null ? null : `${decimal(value, 1)} %`;
}

function perKm(value: number | null): string | null {
  return value === null ? null : `${decimal(value, 2)} €/km`;
}

function money(cents: number | null): string | null {
  return cents === null ? null : formatCents(cents);
}

function groupRow(label: string, group: Omit<ProfitGroup, "key">) {
  return {
    pavadinimas: label,
    reisai: group.tripCount,
    pajamos: money(group.revenueCents),
    kastai: money(group.totalCostCents),
    pelnas: money(group.profitCents),
    marza: percent(group.marginPercent),
    savikaina_uz_km: perKm(group.costPerKm),
    pelnas_uz_km: perKm(group.profitPerKm),
    pelnas_per_para: money(group.profitPerDayCents),
    apmokami_km: Math.round(group.paidKm),
    paros: group.days,
  };
}

// --- Argumentai -------------------------------------------------------------

function record(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw === "" ? "{}" : raw);
  } catch {
    throw new ToolInputError("Argumentai nėra tinkamas JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ToolInputError("Argumentai turi būti objektas.");
  }
  return parsed as Record<string, unknown>;
}

function optionalText(args: Record<string, unknown>, name: string): string | null {
  const value = args[name];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ToolInputError(`${name} turi būti tekstas arba null.`);
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function optionalDate(args: Record<string, unknown>, name: string): string | null {
  const value = optionalText(args, name);
  if (value !== null && !DATE.test(value)) {
    throw new ToolInputError(`${name} turi būti data formatu YYYY-MM-DD.`);
  }
  return value;
}

function oneOf<T extends string>(args: Record<string, unknown>, name: string, allowed: readonly T[], fallback: T): T {
  const value = optionalText(args, name);
  if (value === null) return fallback;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new ToolInputError(`${name} turi būti vienas iš: ${allowed.join(", ")}.`);
  }
  return value as T;
}

function limit(args: Record<string, unknown>, fallback: number): number {
  const value = args.limit;
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ToolInputError("limit turi būti teigiamas sveikasis skaičius.");
  }
  return Math.min(value, MAX_ROWS);
}

export function parseFilter(args: Record<string, unknown>): TripFilter {
  const filter = {
    from: optionalDate(args, "from"),
    to: optionalDate(args, "to"),
    plate: optionalText(args, "plate"),
    customer: optionalText(args, "customer"),
  };
  if (filter.from && filter.to && filter.from > filter.to) {
    throw new ToolInputError("from negali būti vėlesnė už to.");
  }
  return filter;
}

// --- Atranka ----------------------------------------------------------------

/**
 * Reisai pagal datas (imtinai), furą ir užsakovą. Fura lyginama be tarpų,
 * užsakovas – pagal pavadinimo dalį, nes žmogus rašo „Girteka“, o ne pilną
 * „UAB Girteka Logistics“.
 */
export function filterTrips(data: AssistantData, filter: TripFilter): TripSummary[] {
  const plate = filter.plate === null ? null : plateKey(filter.plate);
  const customerIds = filter.customer === null
    ? null
    : new Set(
      data.customers
        .filter((customer) => customerKey(customer.name).includes(customerKey(filter.customer ?? "")))
        .map((customer) => customer.id),
    );

  return data.trips.filter((trip) =>
    (filter.from === null || trip.tripDate >= filter.from)
    && (filter.to === null || trip.tripDate <= filter.to)
    && (plate === null || plateKey(trip.truckPlate) === plate)
    && (customerIds === null || (trip.customerId != null && customerIds.has(trip.customerId))),
  );
}

function filterEcho(filter: TripFilter) {
  return {
    nuo: filter.from ?? "pradžios",
    iki: filter.to ?? "šiandien",
    ...(filter.plate ? { fura: filter.plate } : {}),
    ...(filter.customer ? { uzsakovas: filter.customer } : {}),
  };
}

// --- Įrankiai ---------------------------------------------------------------

function getSummary(data: AssistantData, args: Record<string, unknown>) {
  const filter = parseFilter(args);
  const trips = filterTrips(data, filter);
  const stats = calculateDashboardStats(trips);
  const emptyKm = trips.reduce((total, trip) => total + trip.emptyKm, 0);
  const paidKm = trips.reduce((total, trip) => total + trip.paidKm, 0);

  return {
    atranka: filterEcho(filter),
    reisai: stats.tripCount,
    pajamos: money(stats.revenueCents),
    kastai: money(stats.totalCostCents),
    pelnas: money(stats.profitCents),
    marza: percent(stats.marginPercent),
    savikaina_uz_km: perKm(stats.costPerKm),
    pelnas_uz_km: perKm(stats.profitPerKm),
    pelnas_per_para: money(stats.profitPerDayCents),
    apmokami_km: Math.round(paidKm),
    tuscia_km: Math.round(emptyKm),
    nuostolingi_reisai: trips.filter((trip) => trip.profitCents < 0).length,
  };
}

const GROUPS = ["truck", "route", "customer", "month"] as const;
const ORDERS = ["best", "worst"] as const;

function profitBy(data: AssistantData, args: Record<string, unknown>) {
  const filter = parseFilter(args);
  const group = oneOf(args, "group", GROUPS, "truck");
  const order = oneOf(args, "order", ORDERS, "best");
  const trips = filterTrips(data, filter);

  const entries: { label: string; totals: Omit<ProfitGroup, "key"> }[] = group === "truck"
    ? summarizeByTruck(trips).map(({ plate, ...totals }) => ({ label: plate, totals }))
    : group === "route"
      ? summarizeByRoute(trips).map(({ origin, destination, ...totals }) => ({ label: `${origin} → ${destination}`, totals }))
      : group === "customer"
        ? summarizeByCustomer(trips, data.customers).map((row) => ({ label: row.name, totals: row }))
        : groupProfit(trips, (trip) => tripMonth(trip.tripDate))
          .sort((a, b) => a.key.localeCompare(b.key))
          .map(({ key, ...totals }) => ({ label: key, totals }));

  // Mėnesiai lieka chronologiški, kai klausiama eigos; kitur – pagal pelną.
  // `sort` stabilus, todėl vienodo pelno eilutės lieka savo tvarka.
  const ordered = order === "worst"
    ? [...entries].sort((a, b) => a.totals.profitCents - b.totals.profitCents)
    : group === "month"
      ? entries
      : [...entries].sort((a, b) => b.totals.profitCents - a.totals.profitCents);
  const count = limit(args, group === "month" ? 12 : 10);
  // Chronologiškai rodomi paskutiniai mėnesiai, ne pirmieji.
  const shown = group === "month" && order === "best" ? ordered.slice(-count) : ordered.slice(0, count);

  return {
    atranka: filterEcho(filter),
    grupuota_pagal: group,
    is_viso_grupiu: entries.length,
    rodoma: shown.length,
    eilutes: shown.map(({ label, totals }) => groupRow(label, totals)),
  };
}

const SORTS = ["date", "profit_desc", "profit_asc", "margin_asc"] as const;

function listTrips(data: AssistantData, args: Record<string, unknown>) {
  const filter = parseFilter(args);
  const sort = oneOf(args, "sort", SORTS, "date");
  const customersById = new Map(data.customers.map((customer) => [customer.id, customer.name]));
  const trips = [...filterTrips(data, filter)];

  trips.sort((a, b) => {
    switch (sort) {
      case "profit_desc": return b.profitCents - a.profitCents;
      case "profit_asc": return a.profitCents - b.profitCents;
      // Reisai be maržos (be pajamų) – gale, ne pradžioje.
      case "margin_asc": return (a.marginPercent ?? Infinity) - (b.marginPercent ?? Infinity);
      case "date": return b.tripDate.localeCompare(a.tripDate);
    }
  });

  const shown = trips.slice(0, limit(args, 15));
  return {
    atranka: filterEcho(filter),
    is_viso_reisu: trips.length,
    rodoma: shown.length,
    reisai: shown.map((trip) => ({
      data: trip.tripDate,
      numeris: trip.tripNumber,
      marsrutas: `${trip.origin} → ${trip.destination}`,
      fura: trip.truckPlate,
      uzsakovas: trip.customerId ? (customersById.get(trip.customerId) ?? null) : null,
      pajamos: money(trip.revenueCents),
      kastai: money(trip.totalCostCents),
      pelnas: money(trip.profitCents),
      marza: percent(trip.marginPercent),
      pelnas_per_para: money(trip.profitPerDayCents),
      paros: trip.days,
      apmokami_km: trip.paidKm,
      tuscia_km: trip.emptyKm,
    })),
  };
}

function trucks(data: AssistantData, args: Record<string, unknown>) {
  const plate = optionalText(args, "plate");
  const shown = plate === null ? data.trucks : data.trucks.filter((truck) => plateKey(truck.plate) === plateKey(plate));

  return {
    furos: shown.map((truck) => {
      let daily: number | null = null;
      try {
        daily = calcDailyRate(truckRowToCalc(truck));
      } catch {
        // Neteisingi furos duomenys (pvz. 0 darbo dienų) – geriau „nežinoma“, nei klaida.
      }
      return {
        fura: truck.plate,
        priekaba: truck.trailer_plate ?? null,
        marke: [truck.make, truck.model].filter(Boolean).join(" ") || null,
        metai: truck.manufacture_year ?? null,
        euro_klase: truck.euro_class ?? null,
        asys: truck.axles ?? null,
        kuras: truck.fuel_type ?? null,
        kuro_norma_l_100km: truck.fuel_norm_l_per_100km ?? null,
        adblue_norma_l_100km: truck.adblue_norm_l_per_100km ?? null,
        tuscios_mase_kg: truck.empty_weight_kg ?? null,
        leidziama_bendra_mase_kg: truck.total_permitted_weight_kg ?? null,
        paros_savikaina: money(daily),
        priekabos_nuoma_per_men: money(truck.trailer_monthly_cents),
        technine_galioja_iki: truck.inspection_valid_until ?? null,
        draudimas_galioja_iki: truck.insurance_valid_until ?? null,
        tachografas_galioja_iki: truck.tachograph_calibration_until ?? null,
        ispejimai: documentAlerts(truck, data.today).map(documentAlertText),
        pastabos: truck.notes ?? null,
      };
    }),
    pastaba: "Paros savikaina – dabartinė. Išsaugoti reisai skaičiuoti su tuo metu galiojusia kopija.",
  };
}

function companySettings(data: AssistantData) {
  return {
    minimali_marza: data.settings.minMarginPercent === null ? "nenustatyta" : percent(data.settings.minMarginPercent),
    dienpinigiai_pagal_salis: data.settings.perDiemPercent === null
      ? "išjungta – naudojama furos fiksuota suma"
      : `${decimal(data.settings.perDiemPercent, 0)} % LRV normos`,
    keliu_tarifai: data.tariffs.map((tariff) => ({
      salis: tariff.country,
      tarifas: tariff.rate,
      tipas: tariff.rateType,
    })),
  };
}

function plannedRoads(data: AssistantData, args: Record<string, unknown>) {
  const filter = parseFilter(args);
  const rows = summarizeCountryRoads(filterTrips(data, filter)).filter((row) => row.km > 0);
  return {
    atranka: filterEcho(filter),
    pastaba: "Planuoti kelių kaštai pagal reisų šalių atkarpas, be tiltų, keltų, tunelių ir parkingo. Faktiniai – actual_costs.",
    salys: rows.map((row) => ({
      salis: row.country,
      reisai: row.tripCount,
      km: Math.round(row.km),
      keliai: money(row.costCents),
      dalis: percent(row.costShare),
      kaina_uz_km: row.centsPerKm === null ? null : `${decimal(row.centsPerKm / 100, 2)} €/km`,
    })),
  };
}

function emptyKm(data: AssistantData, args: Record<string, unknown>) {
  const filter = parseFilter(args);
  const trips = filterTrips(data, filter);
  const total = summarizeEmptyKm(trips);
  return {
    atranka: filterEcho(filter),
    tuscia_km: Math.round(total.emptyKm),
    visos_ridos_dalis: percent(total.emptyShare),
    kuras_tusciai_ridai: money(total.emptyFuelCents),
    pastaba: "Skaičiuojamas tik kuras; paros kaštai ir keliai lieka reisui.",
    pagal_fura: emptyKmByTruck(trips)
      .filter((row) => row.emptyKm > 0)
      .map((row) => ({
        fura: row.plate,
        reisai: row.tripCount,
        tuscia_km: Math.round(row.emptyKm),
        dalis: percent(row.emptyShare),
        kuras: money(row.emptyFuelCents),
      })),
  };
}

// --- Telematika (faktas) ----------------------------------------------------

/** Analizės puslapio numatytasis laikotarpis – 30 dienų iki šiandien. */
const DEFAULT_ACTUAL_DAYS = 30;
const TELEMATICS_OFF = { klaida: "Telematika šiai įmonei neprijungta – faktinių kaštų nėra." };

/** Žemiau šios ridos €/km nerodomas: vienas pirkimas per kelis km duotų šimtus €/km (#50). */
const MIN_KM_FOR_RATIO = 100;

function parsePeriod(args: Record<string, unknown>, today: string): { from: string; to: string } {
  const to = optionalDate(args, "to") ?? today;
  const from = optionalDate(args, "from") ?? addDays(to, -DEFAULT_ACTUAL_DAYS);
  if (from > to) throw new ToolInputError("from negali būti vėlesnė už to.");
  return { from, to };
}

function suppliesIn(telematics: TelematicsData, period: { from: string; to: string }): Supply[] {
  return telematics.supplies.filter((supply) => supply.date >= period.from && supply.date <= period.to);
}

function actualRow(row: ActualCosts) {
  return {
    fura: row.plate,
    dienos_su_duomenimis: row.days,
    km: Math.round(row.km),
    kuras_l_pagal_skaitikli: Math.round(row.fuelL),
    sanaudos_l_100km: row.litresPer100Km === null ? null : decimal(row.litresPer100Km, 1),
    kuro_kaina_uz_l: row.fuelPricePerL === null ? null : `${decimal(row.fuelPricePerL, 3)} €`,
    dyzelinas: money(row.dieselCents),
    adblue: money(row.adblueCents),
    keliai: money(row.tollCents),
    kita: money(row.otherCents),
    is_viso_be_kitu: money(row.totalCents),
    eur_uz_km: row.km >= MIN_KM_FOR_RATIO ? `${decimal(row.totalCents / 100 / row.km, 3)} €/km` : null,
  };
}

function actualCosts(data: AssistantData, telematics: TelematicsData | null, args: Record<string, unknown>) {
  if (!telematics) return TELEMATICS_OFF;
  const period = parsePeriod(args, data.today);
  const plate = optionalText(args, "plate");
  const rows = actualsByTruck(telematics.daily, telematics.supplies, period.from, period.to)
    .filter((row) => plate === null || plateKey(row.plate) === plateKey(plate));
  const sum = (pick: (row: ActualCosts) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const km = sum((row) => row.km);
  const total = sum((row) => row.totalCents);

  return {
    laikotarpis: period,
    pastaba: "Faktas iš Telematikos: km ir kuras – vilkikų skaitikliai, sumos – tikri pirkimai be PVM. „Kita“ į „iš viso“ neįeina.",
    is_viso: {
      km: Math.round(km),
      dyzelinas: money(sum((row) => row.dieselCents)),
      adblue: money(sum((row) => row.adblueCents)),
      keliai: money(sum((row) => row.tollCents)),
      kita: money(sum((row) => row.otherCents)),
      is_viso_be_kitu: money(total),
      eur_uz_km: km >= MIN_KM_FOR_RATIO ? `${decimal(total / 100 / km, 3)} €/km` : null,
    },
    furos: rows.map(actualRow),
    duomenu_spragos: {
      be_furos_eiluciu: telematics.issues.unassignedRows,
      be_furos_suma: money(telematics.issues.unassignedCents),
      svetima_valiuta_be_kurso_eiluciu: telematics.issues.otherCurrencyRows,
      perskaiciuota_ecb_kursu_eiluciu: telematics.issues.convertedRows,
      perskaiciuota_ecb_kursu_suma: money(telematics.issues.convertedCents),
    },
  };
}

const FUEL_GROUPS = ["country", "month"] as const;

function fuelPrices(data: AssistantData, telematics: TelematicsData | null, args: Record<string, unknown>) {
  if (!telematics) return TELEMATICS_OFF;
  const period = parsePeriod(args, data.today);
  const by = oneOf(args, "by", FUEL_GROUPS, "country");
  const supplies = suppliesIn(telematics, period);
  const byCountry = fuelPricesByCountry(supplies);
  const rows = by === "country" ? byCountry : fuelPricesByMonth(supplies);
  const fleet = fleetFuelPricePerL(byCountry);

  return {
    laikotarpis: period,
    parko_vidutine_kaina_uz_l: fleet === null ? null : `${decimal(fleet, 3)} €`,
    sutaupytume_jei_visur_pigiausia_salis: money(savingsAtCheapestCents(byCountry)),
    pastaba: "Tik dyzelinas su žinomais litrais. Sutaupymas – dydžio matas, ne pažadas: dalis pylimų neišvengiami ten, kur fura yra.",
    eilutes: rows.map((row) => ({
      [by === "country" ? "salis" : "menuo"]: row.key === "" ? "Nenurodyta" : row.key,
      pylimai: row.purchases,
      litrai: Math.round(row.litres),
      suma: money(row.costCents),
      kaina_uz_l: row.pricePerL === null ? null : `${decimal(row.pricePerL, 3)} €`,
    })),
  };
}

function savingsInsights(data: AssistantData, telematics: TelematicsData | null, args: Record<string, unknown>) {
  if (!telematics) return TELEMATICS_OFF;
  const period = parsePeriod(args, data.today);
  const rows = actualsByTruck(telematics.daily, telematics.supplies, period.from, period.to);
  const insights = costInsights(rows, fuelPricesByCountry(suppliesIn(telematics, period)));
  return {
    laikotarpis: period,
    isvados: insights.map((insight) => ({
      tipas: insight.kind,
      fura: insight.plate,
      pavadinimas: insight.title,
      paaiskinimas: insight.detail,
      suma: money(insight.cents),
    })),
  };
}

function findTrip(data: AssistantData, args: Record<string, unknown>): Trip {
  const number = optionalText(args, "trip_number");
  if (number === null) throw new ToolInputError("Nurodykite reiso numerį (trip_number).");
  const wanted = number.toLocaleLowerCase("lt-LT");
  // Vienodų numerių pasitaiko – imamas naujausias.
  const trip = data.rawTrips
    .filter((row) => row.trip_number.toLocaleLowerCase("lt-LT") === wanted)
    .sort((a, b) => b.trip_date.localeCompare(a.trip_date))[0];
  if (!trip) throw new ToolInputError(`Reiso „${number}“ nėra.`);
  return trip;
}

function planVsActual(data: AssistantData, telematics: TelematicsData | null, args: Record<string, unknown>) {
  const trip = findTrip(data, args);
  if (!telematics) return TELEMATICS_OFF;
  const plate = data.trucks.find((truck) => truck.id === trip.truck_id)?.plate;
  if (!plate) return { klaida: "Reiso fura ištrinta – palyginti nėra su kuo." };

  const planned = calculateSavedTrip(
    trip,
    data.legs.filter((leg) => leg.trip_id === trip.id).map(({ country, km }) => ({ country, km })),
    trip.truck_costs,
    data.tariffs,
  );
  const lastDay = addDays(trip.trip_date, Math.max(1, trip.days) - 1);
  const actual = summarizeActuals(telematics.daily, telematics.supplies, plate, trip.trip_date, lastDay);
  if (actual.km <= 0 && actual.totalCents === 0) {
    return { klaida: "Telematikos duomenų šio reiso dienoms nėra." };
  }

  const variance = compareTripToActuals(trip, planned, actual);
  const labels = { fuel: "kuras", adblue: "adblue", road: "keliai" } as const;
  const ratio = (value: { planned: number; actual: number | null }, places: number) => ({
    planas: decimal(value.planned, places),
    faktas: value.actual === null ? null : decimal(value.actual, places),
  });

  return {
    reisas: `${trip.trip_number}: ${trip.origin} → ${trip.destination}`,
    fura: plate,
    dienos: `${trip.trip_date}–${lastDay}`,
    pastaba: "Faktas imamas visai furai per reiso dienas: jei tomis dienomis ji vežė kelis reisus, kaštai priskiriami kiekvienam. Paros kaštai abiejose pusėse vienodi.",
    eilutes: variance.lines.map((line) => ({
      kas: labels[line.key],
      planas: money(line.plannedCents),
      faktas: money(line.actualCents),
      skirtumas: money(line.diffCents),
    })),
    planuotas_pelnas: money(variance.plannedProfitCents),
    faktinis_pelnas: money(variance.actualProfitCents),
    sanaudos_l_100km: ratio(variance.litresPer100Km, 1),
    kuro_kaina_uz_l: ratio(variance.fuelPricePerL, 3),
    km: ratio(variance.km, 0),
  };
}

async function liveStatus(context: AssistantContext) {
  const [data, telematics, live] = await Promise.all([context.data(), context.telematics(), context.live()]);
  const plates = new Map(data.trucks.map((truck) => [truck.id, truck.plate]));

  const onTheRoad = data.rawTrips
    .filter((trip) => isOnTheRoad(trip.trip_date, trip.days, data.today))
    .map((trip) => {
      const plate = plates.get(trip.truck_id) ?? "";
      const progress = tripProgress(
        telematics?.daily ?? [],
        plate,
        trip.trip_date,
        trip.days,
        trip.paid_km + trip.empty_km,
        calcDailyRate(trip.truck_costs),
        data.today,
      );
      return {
        numeris: trip.trip_number,
        marsrutas: `${trip.origin} → ${trip.destination}`,
        fura: plate || null,
        para: `${progress.dayNow} iš ${progress.daysTotal}`,
        nuvaziuota_km: telematics ? Math.round(progress.drivenKm) : null,
        liko_km: telematics ? Math.round(progress.remainingKm) : null,
        sanaudos_l_100km: progress.litresPer100Km === null ? null : decimal(progress.litresPer100Km, 1),
        planuota_norma_l_100km: trip.fuel_l_per_100km,
        furos_kastai_iki_siol: money(progress.truckCostSoFarCents),
        matuota_iki: progress.measuredThrough,
      };
    });

  return {
    siandien: data.today,
    reisai_kelyje: onTheRoad,
    furos_dabar: live === null
      ? "Furų vietų nėra – Telematika neprijungta."
      : live.trucks.map((truck) => ({
        fura: truck.plate,
        busena: truck.state,
        salis: truck.country,
        paskutinis_signalas: truck.gpsTime,
      })),
    be_vietos: live?.withoutPosition ?? [],
    pastaba: "Nuvažiuota – iki vakar imtinai: šiandienos eilutė Telematikoje atsiranda rytoj.",
  };
}

function payments(data: AssistantData, args: Record<string, unknown>) {
  const filter = parseFilter(args);
  const trips = filterTrips(data, filter);
  if (trips.some((trip) => trip.invoicedOn === undefined)) {
    return { klaida: "Apmokėjimų datų duomenų bazėje dar nėra." };
  }

  const termsById = new Map(data.customers.map((customer) => [customer.id, customer.payment_terms_days ?? null]));
  const customersById = new Map(data.customers.map((customer) => [customer.id, customer.name]));
  const withTerms = trips.map((trip) => ({
    trip,
    payment: {
      invoicedOn: trip.invoicedOn ?? null,
      paidOn: trip.paidOn ?? null,
      termsDays: trip.customerId ? (termsById.get(trip.customerId) ?? null) : null,
      revenueCents: trip.revenueCents,
    },
  }));
  const summary = summarizePayments(withTerms.map(({ payment }) => payment), data.today);
  const overdue = withTerms
    .map(({ trip, payment }) => ({ trip, state: paymentState(payment, data.today) }))
    .filter(({ state }) => state.status === "overdue")
    .sort((a, b) => (b.state.daysLate ?? 0) - (a.state.daysLate ?? 0))
    .slice(0, limit(args, 15));

  return {
    atranka: filterEcho(filter),
    laukiama_apmokejimo: money(summary.openCents),
    is_ju_veluoja: money(summary.overdueCents),
    veluojanciu_saskaitu: summary.overdueCount,
    apmoketa_saskaitu: summary.paidCount,
    apmoketa_pavelavus: summary.paidLateCount,
    vidutiniskai_dienu_iki_apmokejimo: summary.avgDaysToPay === null ? null : Math.round(summary.avgDaysToPay),
    veluojancios: overdue.map(({ trip, state }) => ({
      numeris: trip.tripNumber,
      uzsakovas: trip.customerId ? (customersById.get(trip.customerId) ?? null) : null,
      suma: money(trip.revenueCents),
      busena: paymentStateText(state),
    })),
  };
}

// --- Aprašai modeliui -------------------------------------------------------

const FILTER_PROPERTIES = {
  from: { type: ["string", "null"], description: "Reiso data nuo (imtinai), YYYY-MM-DD. null – be ribos." },
  to: { type: ["string", "null"], description: "Reiso data iki (imtinai), YYYY-MM-DD. null – be ribos." },
  plate: { type: ["string", "null"], description: "Furos valstybinis numeris, pvz. „NNN 888“. null – visos furos." },
  customer: { type: ["string", "null"], description: "Užsakovo pavadinimas ar jo dalis. null – visi užsakovai." },
} as const;

function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
): FunctionTool {
  return {
    type: "function",
    name,
    description,
    strict: true,
    parameters: {
      type: "object",
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    },
  };
}

export const ASSISTANT_TOOLS: FunctionTool[] = [
  tool(
    "get_summary",
    "Bendri išsaugotų reisų skaičiai: reisų skaičius, pajamos, kaštai, pelnas, marža, savikaina ir pelnas už km, pelnas per parą, tuščia rida. Su atranka pagal datas, furą, užsakovą.",
    FILTER_PROPERTIES,
  ),
  tool(
    "profit_by",
    "Pelningumas sugrupuotas pagal furą, kryptį (maršrutą), užsakovą arba mėnesį. Tinka klausimams „kuri fura / kryptis / užsakovas uždirba daugiausia ar mažiausia“ ir mėnesių eigai.",
    {
      ...FILTER_PROPERTIES,
      group: { type: "string", enum: [...GROUPS], description: "truck – fura, route – kryptis, customer – užsakovas, month – mėnuo (chronologiškai)." },
      order: { type: "string", enum: [...ORDERS], description: "best – pelningiausi pirmi (mėnesiai – chronologiškai), worst – mažiausio pelno pirmi." },
      limit: { type: ["integer", "null"], description: `Kiek eilučių grąžinti, iki ${MAX_ROWS}. null – 10 (mėnesių – 12).` },
    },
  ),
  tool(
    "list_trips",
    "Atskiri reisai su pajamomis, kaštais, pelnu ir marža. Tinka konkretiems reisams rasti, pvz. nuostolingiausiems ar paskutiniams.",
    {
      ...FILTER_PROPERTIES,
      sort: { type: "string", enum: [...SORTS], description: "date – naujausi pirmi, profit_desc / profit_asc – pagal pelną, margin_asc – mažiausia marža pirma." },
      limit: { type: ["integer", "null"], description: `Kiek reisų grąžinti, iki ${MAX_ROWS}. null – 15.` },
    },
  ),
  tool(
    "trucks",
    "Furų duomenys: markė, metai, euro klasė, priekaba, kuro ir AdBlue normos, svoriai, dabartinė paros savikaina, priekabos nuoma, dokumentų (techninė, draudimas, tachografas) galiojimas ir įspėjimai.",
    { plate: FILTER_PROPERTIES.plate },
  ),
  tool(
    "payments",
    "Sąskaitos ir apmokėjimai: kiek laukiama, kiek vėluoja, kurie užsakovai vėluoja mokėti.",
    {
      ...FILTER_PROPERTIES,
      limit: { type: ["integer", "null"], description: `Kiek vėluojančių sąskaitų išvardyti, iki ${MAX_ROWS}. null – 15.` },
    },
  ),
  tool(
    "company_settings",
    "Įmonės nustatymai: minimali marža, dienpinigių skaičiavimas, kelių tarifai pagal šalis.",
    {},
  ),
  tool(
    "planned_road_costs",
    "Planuoti (pagal reisus) kelių mokesčiai pagal šalį: km, suma, dalis, €/km.",
    FILTER_PROPERTIES,
  ),
  tool(
    "empty_km",
    "Tuščia rida: kiek km važiuota be krovinio, kokia dalis ir kiek kuro tam sudeginta – iš viso ir pagal furą.",
    FILTER_PROPERTIES,
  ),
  tool(
    "actual_costs",
    "FAKTINIAI kaštai iš Telematikos pagal furą: tikra rida, kuras pagal skaitiklį, faktinės sąnaudos l/100 km, sumokėta kuro kaina už litrą, dyzelinas, AdBlue, keliai, kita, €/km. Laikotarpis pagal pirkimų ir važiavimo datą.",
    {
      from: { type: ["string", "null"], description: "Nuo (imtinai), YYYY-MM-DD. null – 30 dienų iki „to“." },
      to: { type: ["string", "null"], description: "Iki (imtinai), YYYY-MM-DD. null – šiandien." },
      plate: FILTER_PROPERTIES.plate,
    },
  ),
  tool(
    "fuel_prices",
    "Faktinės kuro kainos iš pirkimų pagal šalį arba mėnesį: litrai, suma, kaina už litrą, parko vidurkis ir kiek sutaupytume pildami pigiausioje šalyje.",
    {
      from: { type: ["string", "null"], description: "Nuo (imtinai), YYYY-MM-DD. null – 30 dienų iki „to“." },
      to: { type: ["string", "null"], description: "Iki (imtinai), YYYY-MM-DD. null – šiandien." },
      by: { type: "string", enum: [...FUEL_GROUPS], description: "country – pagal šalį, month – pagal mėnesį." },
    },
  ),
  tool(
    "savings_insights",
    "Analizės taupymo išvados: furos, kurių sąnaudos viršija parko medianą, brangiau mokama kuro kaina, šalys, kur kuras brangesnis – su suma eurais.",
    {
      from: { type: ["string", "null"], description: "Nuo (imtinai), YYYY-MM-DD. null – 30 dienų iki „to“." },
      to: { type: ["string", "null"], description: "Iki (imtinai), YYYY-MM-DD. null – šiandien." },
    },
  ),
  tool(
    "trip_plan_vs_actual",
    "Vieno išsaugoto reiso planas prieš faktą: kuras, AdBlue, keliai, sąnaudos l/100 km, kuro kaina, km ir kiek dėl to skiriasi pelnas.",
    { trip_number: { type: "string", description: "Reiso numeris, kaip įvestas reise." } },
  ),
  tool(
    "live_status",
    "Kas vyksta dabar: šiandien kelyje esantys reisai (kelinta para, nuvažiuota, liko, faktinės sąnaudos) ir kur kiekviena fura yra, ar važiuoja, paskutinis signalas.",
    {},
  ),
];

/** Vykdo įrankį. Neteisingi argumentai grąžinami modeliui kaip klaida, o ne metami. */
export async function runAssistantTool(name: string, rawArgs: string, context: AssistantContext): Promise<unknown> {
  try {
    const args = record(rawArgs);
    switch (name) {
      case "get_summary": return getSummary(await context.data(), args);
      case "profit_by": return profitBy(await context.data(), args);
      case "list_trips": return listTrips(await context.data(), args);
      case "trucks": return trucks(await context.data(), args);
      case "payments": return payments(await context.data(), args);
      case "company_settings": return companySettings(await context.data());
      case "planned_road_costs": return plannedRoads(await context.data(), args);
      case "empty_km": return emptyKm(await context.data(), args);
      case "actual_costs": return actualCosts(await context.data(), await context.telematics(), args);
      case "fuel_prices": return fuelPrices(await context.data(), await context.telematics(), args);
      case "savings_insights": return savingsInsights(await context.data(), await context.telematics(), args);
      case "trip_plan_vs_actual": return planVsActual(await context.data(), await context.telematics(), args);
      case "live_status": return await liveStatus(context);
      default: return { klaida: `Nežinomas įrankis: ${name}` };
    }
  } catch (cause) {
    if (cause instanceof ToolInputError) return { klaida: cause.message };
    // Telematika ar duomenų bazė nepasiekiama – modelis turi tai pasakyti,
    // o ne nutraukti visą atsakymą.
    console.error(`Klausk Bramit: įrankis ${name}`, cause);
    return { klaida: "Nepavyko gauti duomenų – šaltinis šiuo metu nepasiekiamas." };
  }
}
