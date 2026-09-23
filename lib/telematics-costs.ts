/**
 * Faktiniai furos kaštai iš telematikos (#44).
 *
 * Skirtumas nuo lib/calc.ts: ten skaičiuojama, kiek reisas **turėtų** kainuoti
 * pagal normas, o čia — kiek jis kainavo **iš tikrųjų**. Abu reikalingi:
 * pirmas kainai pasiūlyti, antras patikrinti, ar neapsirikta.
 *
 * Šaltiniai:
 *   CANDaily — km ir kuro litrai kiekvienai furai kiekvienai dienai
 *   Supplies — kuro, AdBlue pirkimai ir sumokėti kelių mokesčiai
 */

import { normalizePlate } from "./truck";

export interface DailyDistance {
  plate: string;
  /** "2026-09-22" */
  date: string;
  km: number;
  /** Sunaudoti litrai. Be kuro daviklio — null. */
  fuelL: number | null;
}

/** Į ką išleista. `other` – viskas, kas nepatenka į reiso kaštų modelį. */
export type SupplyKind = "diesel" | "adblue" | "toll" | "other";

export interface Supply {
  plate: string;
  date: string;
  kind: SupplyKind;
  /** Litrai kurui ir AdBlue, kitaip null. */
  quantity: number | null;
  costCents: number;
  /** ISO3 arba null. */
  country: string | null;
}

export interface ActualCosts {
  plate: string;
  from: string;
  to: string;
  days: number;
  km: number;
  /** Litrai iš vilkiko skaitiklio, ne iš pirkimų. */
  fuelL: number;
  dieselCents: number;
  adblueCents: number;
  tollCents: number;
  /** Į reiso kaštų modelį netelpantys pirkimai. Rodomi atskirai, nemetami. */
  otherCents: number;
  /** Kuras + AdBlue + keliai. `otherCents` čia neįeina sąmoningai. */
  totalCents: number;
  /** Nupirkti AdBlue litrai. Tai pirkimai, ne sunaudojimas. */
  adblueL: number;
  /** Faktinė sumokėta kaina už litrą. null, kai per laikotarpį nepirkta. */
  fuelPricePerL: number | null;
  /** Faktinė AdBlue kaina už litrą. null, kai nepirkta. */
  adbluePricePerL: number | null;
  /** Faktinės sąnaudos l/100 km. null, kai nevažiuota. */
  litresPer100Km: number | null;
}

/**
 * Raktas furai atpažinti.
 *
 * Tas pats vilkikas skirtinguose tiekėjo atsakymuose rašomas skirtingai:
 * CANDaily siunčia „LZR 118", o Supplies – „LZR118". Lyginant paraidžiui
 * fura suskyla į dvi: viena su kilometrais be kaštų, kita su kaštais be
 * kilometrų. Todėl lyginama be tarpų.
 */
export function plateKey(plate: string): string {
  return plate.replace(/\s+/g, "").toUpperCase();
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function decimal(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = text(value);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Suma į centus.
 *
 * Tiekėjas siunčia tris skaitmenis po kablelio ("344.140"), todėl griežtas
 * parseEuroToCents netinka – jis skirtas tam, ką veda žmogus. Čia apvalinama.
 */
function costToCents(value: unknown): number | null {
  const parsed = decimal(value);
  return parsed === null ? null : Math.round(parsed * 100);
}

export function parseCanDaily(payload: unknown): DailyDistance[] {
  if (!Array.isArray(payload)) throw new Error("CANDaily atsakymas turi būti sąrašas.");

  const rows: DailyDistance[] = [];
  for (const row of payload) {
    if (typeof row !== "object" || row === null) continue;
    const source = row as Record<string, unknown>;
    const plate = text(source.Plates);
    const date = text(source.Date);
    const km = decimal(source.DayDistance);
    if (!plate || !date || km === null) continue;

    rows.push({ plate: normalizePlate(plate), date, km, fuelL: decimal(source.DayFuelConsumption) });
  }
  return rows;
}

/**
 * Kelio mokestis komentare vadinamas vietine kalba.
 *
 * Angliškas „toll" toli gražu ne visur: Vokietijoje Maut, Prancūzijoje péage,
 * Italijoje pedaggio, Norvegijoje bompenger. Neatpažintas mokestis nukristų į
 * `other` ir savikaina atrodytų mažesnė, nei yra — klaida ta puse, kurios
 * nepastebi.
 */
const TOLL_WORDS = [
  "toll", "vignette", "vinjet", "maut", "peage", "pedaggio", "peaje",
  "portagem", "myto", "bompenger", "broavgift", "trangselskatt", "ecotaxe",
];

/** Be diakritikos ir mažosiomis: „Péage" ir „peage" turi sutapti. */
function foldText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function supplyKind(typeTitle: string | null, comment: string | null): SupplyKind {
  if (typeTitle === "Diesel") return "diesel";
  if (typeTitle === "Ad Blue") return "adblue";
  if (typeTitle === "Eurovignettes") return "toll";

  const label = foldText(`${typeTitle ?? ""} ${comment ?? ""}`);
  return TOLL_WORDS.some((word) => label.includes(word)) ? "toll" : "other";
}

/**
 * Pirkimai, kurių furai priskirti negalima.
 *
 * Jie nedingsta tyliai: nepriskirtos sumos rodomos atskirai, kitaip įmonės
 * išlaidos iškristų iš akių ir niekas apie tai nesužinotų.
 */
export interface SupplyIssues {
  /** Be furos numerio — įmonės lygio mokesčiai (komisiniai ir pan.). */
  unassignedRows: number;
  unassignedCents: number;
  /** Ne eurais ir be kurso. Tokių neverčiame: spėti kursą blogiau nei praleisti. */
  otherCurrencyRows: number;
  /**
   * Perskaičiuota ECB kursu (#57).
   *
   * Rodoma atskirai, nes tai **įvertis**: kortelės tiekėjas nurašo savo kursu
   * su savo marža. Sumaišius su tikromis sumomis, puslapis vadintųsi
   * „Faktiniai kaštai" ir rodytų spėjimą.
   */
  convertedRows: number;
  convertedCents: number;
  /**
   * Tos pačios eilutės su fura ir data.
   *
   * Lentelei užtenka skaičiaus, bet reiso forma iš šitų duomenų **įrašo sumą į
   * reisą**. Tada reikia įspėti tik tą furą ir laikotarpį, kurį tai liečia, o
   * ne visą atsakymą.
   */
  otherCurrency: SkippedSupply[];
}

/** Praleistas pirkimas — tiek, kiek reikia įspėjimui. */
export interface SkippedSupply {
  plate: string | null;
  date: string | null;
  currency: string;
}

/**
 * Suma svetima valiuta į eurų centus, arba `null`, jei kurso nėra.
 * Paduodama iš išorės, kad šis failas nieko nežinotų apie ECB (#57).
 */
export type ToEuroCents = (amount: number, currency: string, date: string) => number | null;

export function parseSupplies(
  payload: unknown,
  toEuroCents?: ToEuroCents,
): { supplies: Supply[]; issues: SupplyIssues } {
  if (!Array.isArray(payload)) throw new Error("Supplies atsakymas turi būti sąrašas.");

  const supplies: Supply[] = [];
  const issues: SupplyIssues = {
    unassignedRows: 0,
    unassignedCents: 0,
    otherCurrencyRows: 0,
    otherCurrency: [],
    convertedRows: 0,
    convertedCents: 0,
  };

  for (const row of payload) {
    if (typeof row !== "object" || row === null) continue;
    const source = row as Record<string, unknown>;
    const plate = text(source.Plates) ?? text(source.Number);
    const operationDate = text(source.OperationDate);
    const currency = text(source.CurrencyShortTitle);
    const date = operationDate === null ? null : operationDate.slice(0, 10);

    // Eurai imami kaip yra; svetima valiuta verčiama, jei kursas paduotas.
    let costCents = currency === "EUR" ? costToCents(source.TotalPrice) : null;
    let converted = false;

    if (costCents === null && currency !== null && currency !== "EUR" && date !== null && toEuroCents) {
      const amount = decimal(source.TotalPrice);
      const inEuro = amount === null ? null : toEuroCents(amount, currency, date);
      if (inEuro !== null) {
        costCents = inEuro;
        converted = true;
      }
    }

    if (costCents === null) {
      issues.otherCurrencyRows += 1;
      issues.otherCurrency.push({
        plate: plate === null ? null : normalizePlate(plate),
        date,
        currency: currency ?? "",
      });
      continue;
    }

    if (converted) {
      issues.convertedRows += 1;
      issues.convertedCents += costCents;
    }

    if (!plate || !operationDate) {
      issues.unassignedRows += 1;
      issues.unassignedCents += costCents;
      continue;
    }

    supplies.push({
      plate: normalizePlate(plate),
      date: operationDate.slice(0, 10),
      kind: supplyKind(text(source.TypeTitle), text(source.Comment)),
      quantity: decimal(source.Quantity),
      costCents,
      country: text(source.Country),
    });
  }

  return { supplies, issues };
}

/** Laikotarpio ribos imtinai, formatu "2026-09-01". */
export function summarizeActuals(
  daily: DailyDistance[],
  supplies: Supply[],
  plate: string,
  from: string,
  to: string,
): ActualCosts {
  const wanted = plateKey(plate);
  const inRange = (row: { plate: string; date: string }) =>
    plateKey(row.plate) === wanted && row.date >= from && row.date <= to;

  const days = daily.filter(inRange);
  const km = days.reduce((total, day) => total + day.km, 0);
  const fuelL = days.reduce((total, day) => total + (day.fuelL ?? 0), 0);

  const mine = supplies.filter(inRange);
  const sum = (kind: SupplyKind) =>
    mine.filter((s) => s.kind === kind).reduce((total, s) => total + s.costCents, 0);

  const dieselCents = sum("diesel");
  const adblueCents = sum("adblue");
  const tollCents = sum("toll");
  const otherCents = sum("other");

  const litres = (kind: SupplyKind) =>
    mine.filter((s) => s.kind === kind).reduce((total, s) => total + (s.quantity ?? 0), 0);

  const dieselL = litres("diesel");
  const adblueL = litres("adblue");

  return {
    plate: normalizePlate(plate),
    from,
    to,
    days: days.length,
    km,
    fuelL,
    dieselCents,
    adblueCents,
    tollCents,
    otherCents,
    totalCents: dieselCents + adblueCents + tollCents,
    adblueL,
    fuelPricePerL: dieselL > 0 ? dieselCents / 100 / dieselL : null,
    adbluePricePerL: adblueL > 0 ? adblueCents / 100 / adblueL : null,
    litresPer100Km: km > 0 && fuelL > 0 ? (fuelL / km) * 100 : null,
  };
}

/** Reiso formos laukai, užpildyti iš faktinių duomenų (#44). */
export interface TripFill {
  days: string;
  paid_km: string;
  empty_km: string;
  fuel_l_per_100km: string;
  fuel_price: string;
  adblue_l_per_100km: string;
  adblue_price: string;
  bridges_cents: string;
  /** Visi laikotarpio km – atkarpai „Nemokami", kad formos patikra sutaptų. */
  legKm: string;
}

/** Dienų skaičius imtinai: "2026-09-01".."2026-09-03" = 3. */
function spanDays(from: string, to: string): number {
  const diena = 86_400_000;
  return Math.round((Date.parse(to) - Date.parse(from)) / diena) + 1;
}

/**
 * Faktinius duomenis paverčia formos reikšmėmis.
 *
 * Ko telematika **negali** pasakyti, tas neužpildoma:
 * - apmokamų ir tuščių km skirtumo nėra, todėl visi km dedami į apmokamus,
 *   o tuščius vartotojas atskiria pats;
 * - sumokėti keliai dedami į „Tiltai / vinjetės", o atkarpa paliekama
 *   „Nemokami": tikra sąskaita pakeičia įkainio spėjimą;
 * - pajamų telematikoje nėra visai.
 */
export function tripFillFromActuals(costs: ActualCosts): TripFill {
  const round = (value: number, places: number) => value.toFixed(places);

  return {
    days: String(Math.max(1, spanDays(costs.from, costs.to))),
    paid_km: round(costs.km, 2),
    empty_km: "0",
    fuel_l_per_100km: costs.litresPer100Km === null ? "" : round(costs.litresPer100Km, 4),
    fuel_price: costs.fuelPricePerL === null ? "" : round(costs.fuelPricePerL, 4),
    adblue_l_per_100km: costs.km > 0 && costs.adblueL > 0 ? round((costs.adblueL / costs.km) * 100, 4) : "0",
    adblue_price: costs.adbluePricePerL === null ? "0" : round(costs.adbluePricePerL, 4),
    bridges_cents: round(costs.tollCents / 100, 2),
    legKm: round(costs.km, 2),
  };
}
