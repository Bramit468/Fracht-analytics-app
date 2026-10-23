/**
 * Dedikuoti pasiūlymai: fura su vairuotoju vienam užsakovui visą mėnesį.
 *
 * Reisas skaičiuojamas „para × paros", o čia – mėnuo: fura kainuoja visą
 * mėnesį, net jei užsakovas jos neapkrovė. Todėl svarbiausias klausimas ne
 * „kiek uždirbsiu", o „kiek km reikia, kad €/km padengtų kaštus". Pažadėti
 * „~10 000 km per mėnesį" niekam neįpareigoja – minimumas turi būti sutartyje.
 *
 * Du kainos modeliai:
 * - `fixed_plus_km` – fiksuotas mėnesio mokestis (fura + vairuotojas) ir €/km;
 * - `km_with_min`   – tik €/km, bet ne mažiau nei už minimalų km kiekį.
 */

import { DAYS_PER_MONTH } from "./calc";
import { parseEuroToCents } from "./money";
import { priceForMargin } from "./pricing";

export type PricingModel = "fixed_plus_km" | "km_with_min";

export const PRICING_MODELS: Record<PricingModel, string> = {
  fixed_plus_km: "Fiksuotas mėnesio mokestis + €/km",
  km_with_min: "Tik €/km su minimaliu km kiekiu",
};

export type OfferStatus = "draft" | "sent" | "accepted" | "rejected";

export const OFFER_STATUSES: Record<OfferStatus, string> = {
  draft: "Juodraštis",
  sent: "Išsiųstas",
  accepted: "Priimtas",
  rejected: "Atmestas",
};

/**
 * Derybiniai klausimai. Be `options` – laisvas tekstas.
 *
 * Keturi atsakymai keičia skaičiavimą (žr. `calcDedicated`), kiti tik
 * įrašomi, kad derantis nė vienas nebūtų pamirštas.
 */
export const NEGOTIATION_QUESTIONS = [
  { key: "fuel", label: "Kuras", options: ["Įskaičiuotas į kainą", "Kuro priemoka pagal indeksą", "Apmoka užsakovas"] },
  { key: "fuel_index", label: "Kuro priemokos sąlygos (indeksas, bazinė kaina, slenkstis, dažnis)" },
  { key: "tolls", label: "Keliai, keltai, tuneliai", options: ["Įskaičiuoti į kainą", "Perstatomi pagal faktą"] },
  { key: "empty_km", label: "Tušti km", options: ["Neapmokami", "Apmokami"] },
  { key: "minimum", label: "Jei nesurenkama minimumo km", options: ["Moka už minimumą", "Moka tik už faktą"] },
  { key: "excess", label: "Įkainis už viršytus km" },
  { key: "waiting", label: "Prastovos (nemokamos valandos, įkainis/val.)" },
  { key: "weekends", label: "Savaitgaliai ir 45 val. poilsis", options: ["Apmoka užsakovas", "Neapmokami"] },
  { key: "drivers", label: "Vairuotojai", options: ["Vienas", "Du pamainomis"] },
  { key: "per_diem", label: "Dienpinigiai", options: ["Mūsų", "Užsakovo"] },
  { key: "trailer", label: "Priekaba", options: ["Mūsų", "Užsakovo"] },
  { key: "replacement", label: "Pakaitinė fura gedimo atveju", options: ["Reikalinga", "Nereikalinga"] },
  { key: "indexation", label: "Kainos indeksacija", options: ["Kas metus", "Pagal kuro indeksą", "Nėra"] },
  { key: "term", label: "Sutarties trukmė ir nutraukimo terminas" },
  { key: "payment", label: "Mokėjimo terminas" },
  { key: "liability", label: "CMR draudimo limitas, atsakomybė" },
] as const satisfies readonly { key: string; label: string; options?: readonly string[] }[];

export type Terms = Partial<Record<(typeof NEGOTIATION_QUESTIONS)[number]["key"], string>>;

/** Pasiūlymas, kaip jis saugomas `dedicated_offers` lentelėje. */
export interface DedicatedOfferInsert {
  title: string;
  customer: string | null;
  truck_id: string | null;
  status: OfferStatus;
  truck_daily_cents: number;
  paid_km_month: number;
  empty_km_month: number;
  fuel_l_per_100km: number;
  fuel_price: number;
  adblue_l_per_100km: number;
  adblue_price: number;
  toll_per_km: number;
  pricing_model: PricingModel;
  monthly_fee_cents: number;
  rate_per_km: number;
  min_km_month: number;
  margin_percent: number;
  terms: Terms;
  notes: string | null;
}

export interface DedicatedOffer extends DedicatedOfferInsert {
  id: string;
  created_at: string;
}

export interface DedicatedResult {
  totalKm: number;
  /** Km, už kuriuos moka užsakovas: apmokami, o jei sutarta – ir tušti. */
  billableKm: number;
  truckCents: number;
  fuelCents: number;
  adblueCents: number;
  tollCents: number;
  totalCostCents: number;
  revenueCents: number;
  profitCents: number;
  /** null, kai pajamų nėra. */
  marginPercent: number | null;
  /** Savikaina už apmokamą km. null, kai tokių km nėra. */
  costPerKm: number | null;
  costPerDayCents: number;
  /** Kiek apmokamų km per mėnesį reikia, kad kaina padengtų kaštus. null – nepadengs niekada. */
  breakEvenKm: number | null;
}

/** Kuo skaičiavimas remiasi: furos kaštai ir kiek ji važiuos. */
type CalcInput = Omit<DedicatedOfferInsert, "title" | "customer" | "truck_id" | "status" | "notes" | "margin_percent">;

/** Kintami kaštai už vieną nuvažiuotą km, EUR: tai, ką apmokame mes. */
function variablePerKm(offer: CalcInput): number {
  const fuel = offer.terms.fuel === "Apmoka užsakovas"
    ? 0
    : (offer.fuel_l_per_100km / 100) * offer.fuel_price + (offer.adblue_l_per_100km / 100) * offer.adblue_price;
  // Perstatomi keliai – tranzitas: išrašome tiek, kiek sumokėjome.
  const tolls = offer.terms.tolls === "Perstatomi pagal faktą" ? 0 : offer.toll_per_km;
  return fuel + tolls;
}

function billable(offer: CalcInput): { totalKm: number; billableKm: number } {
  const totalKm = offer.paid_km_month + offer.empty_km_month;
  return { totalKm, billableKm: offer.terms.empty_km === "Apmokami" ? totalKm : offer.paid_km_month };
}

/** Ar užsakovas moka už minimumą, net jei tiek nenuvažiuota. */
function minimumApplies(offer: CalcInput): boolean {
  return offer.pricing_model === "km_with_min" && offer.terms.minimum !== "Moka tik už faktą";
}

function revenueFor(offer: CalcInput, billableKm: number): number {
  if (offer.pricing_model === "fixed_plus_km") {
    return offer.monthly_fee_cents + Math.round(offer.rate_per_km * billableKm * 100);
  }
  const km = minimumApplies(offer) ? Math.max(billableKm, offer.min_km_month) : billableKm;
  return Math.round(offer.rate_per_km * km * 100);
}

/**
 * Lūžio taškas: F + v·r·K = pajamos(K), kur r – visų ir apmokamų km santykis.
 * Minimumo modelyje grąžinamas taškas be minimumo – tai ir yra skaičius,
 * žemiau kurio minimumo derėtis nėra prasmės.
 */
function breakEven(offer: CalcInput, truckCents: number): number | null {
  const { totalKm, billableKm } = billable(offer);
  const ratio = billableKm > 0 ? totalKm / billableKm : 1;
  const marginal = offer.rate_per_km - variablePerKm(offer) * ratio;
  const fixedEuro = (truckCents - (offer.pricing_model === "fixed_plus_km" ? offer.monthly_fee_cents : 0)) / 100;
  if (fixedEuro <= 0) return 0;
  if (marginal <= 0) return null;
  return Math.ceil(fixedEuro / marginal);
}

export function calcDedicated(offer: CalcInput): DedicatedResult {
  const { totalKm, billableKm } = billable(offer);
  const truckCents = Math.round(offer.truck_daily_cents * DAYS_PER_MONTH);
  const fuelPaid = offer.terms.fuel !== "Apmoka užsakovas";
  const fuelCents = fuelPaid ? Math.round(totalKm * (offer.fuel_l_per_100km / 100) * offer.fuel_price * 100) : 0;
  const adblueCents = fuelPaid ? Math.round(totalKm * (offer.adblue_l_per_100km / 100) * offer.adblue_price * 100) : 0;
  const tollCents = offer.terms.tolls === "Perstatomi pagal faktą" ? 0 : Math.round(totalKm * offer.toll_per_km * 100);
  const totalCostCents = truckCents + fuelCents + adblueCents + tollCents;
  const revenueCents = revenueFor(offer, billableKm);
  const profitCents = revenueCents - totalCostCents;

  return {
    totalKm,
    billableKm,
    truckCents,
    fuelCents,
    adblueCents,
    tollCents,
    totalCostCents,
    revenueCents,
    profitCents,
    marginPercent: revenueCents > 0 ? (profitCents / revenueCents) * 100 : null,
    costPerKm: billableKm > 0 ? totalCostCents / 100 / billableKm : null,
    costPerDayCents: Math.round(totalCostCents / DAYS_PER_MONTH),
    breakEvenKm: breakEven(offer, truckCents),
  };
}

export interface SuggestedPrice {
  /** Tik `fixed_plus_km`: mokestis, dengiantis furą ir vairuotoją su marža. */
  monthlyFeeCents: number | null;
  ratePerKm: number | null;
  /** Tik `km_with_min`: mažiausias minimumas, kad pasiūlytas €/km padengtų kaštus. */
  minKm: number | null;
}

/**
 * Kaina norimai maržai.
 *
 * Fiksuotas mokestis dengia fiksuotus kaštus, €/km – kintamus: tada pelnas
 * nepriklauso nuo to, kiek užsakovas iš tikrųjų apkraus furą.
 */
export function suggestPrice(offer: CalcInput, marginPercent: number): SuggestedPrice {
  const result = calcDedicated(offer);
  if (result.billableKm <= 0) return { monthlyFeeCents: null, ratePerKm: null, minKm: null };

  if (offer.pricing_model === "fixed_plus_km") {
    const variableCents = result.fuelCents + result.adblueCents + result.tollCents;
    const variablePrice = variableCents > 0 ? priceForMargin(variableCents, marginPercent) : 0;
    return {
      monthlyFeeCents: priceForMargin(result.truckCents, marginPercent),
      ratePerKm: variablePrice === null ? null : variablePrice / 100 / result.billableKm,
      minKm: null,
    };
  }

  const price = priceForMargin(result.totalCostCents, marginPercent);
  if (price === null) return { monthlyFeeCents: null, ratePerKm: null, minKm: null };
  const ratePerKm = price / 100 / result.billableKm;
  return { monthlyFeeCents: null, ratePerKm, minKm: breakEven({ ...offer, rate_per_km: ratePerKm }, result.truckCents) };
}

/** Kas, jei užsakovas apkraus mažiau ar daugiau, nei žada. */
export function sensitivity(offer: CalcInput, shares: readonly number[] = [0.7, 0.85, 1, 1.15]) {
  return shares.map((share) => {
    const result = calcDedicated({ ...offer, paid_km_month: offer.paid_km_month * share, empty_km_month: offer.empty_km_month * share });
    return { share, billableKm: result.billableKm, profitCents: result.profitCents, marginPercent: result.marginPercent };
  });
}

export type DedicatedFormValues = Record<string, string>;
export type DedicatedFormErrors = Record<string, string>;

/** Patikrina formą. Skaičiai priima ir kablelį, sumos – kaip visur, iki centų. */
export function parseDedicatedForm(
  values: DedicatedFormValues,
): { ok: true; value: DedicatedOfferInsert } | { ok: false; errors: DedicatedFormErrors } {
  const errors: DedicatedFormErrors = {};
  const text = (name: string) => (values[name] ?? "").trim();

  const number = (name: string, max: number): number => {
    const raw = text(name).replace(/\s/g, "").replace(",", ".");
    if (raw === "") return 0;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > max) {
      errors[name] = `Įveskite skaičių nuo 0 iki ${max}.`;
      return 0;
    }
    return value;
  };

  const money = (name: string): number => {
    if (text(name) === "") return 0;
    const cents = parseEuroToCents(text(name));
    if (cents === null) {
      errors[name] = "Įveskite neneigiamą sumą eurais, pvz. 262 arba 262,08.";
      return 0;
    }
    return cents;
  };

  const title = text("title");
  if (title === "") errors.title = "Įveskite pavadinimą, pvz. užsakovą ir maršrutą.";
  else if (title.length > 200) errors.title = "Pavadinimas per ilgas (daugiausia 200 simbolių).";

  const model = text("pricing_model");
  if (!(model in PRICING_MODELS)) errors.pricing_model = "Pasirinkite kainos modelį.";
  const status = text("status") || "draft";
  if (!(status in OFFER_STATUSES)) errors.status = "Nežinoma būsena.";

  const margin = text("margin_percent") === "" ? 0 : Number(text("margin_percent").replace(",", "."));
  if (!Number.isFinite(margin) || margin < 0 || margin >= 100) errors.margin_percent = "Marža nuo 0 iki 99,9 %.";

  const paidKm = number("paid_km_month", 100000);
  if (paidKm <= 0 && !errors.paid_km_month) errors.paid_km_month = "Kiek apmokamų km per mėnesį planuoja užsakovas?";

  const terms: Terms = {};
  for (const question of NEGOTIATION_QUESTIONS) {
    const answer = text(`term_${question.key}`);
    if (answer === "") continue;
    if ("options" in question && !(question.options as readonly string[]).includes(answer)) {
      errors[`term_${question.key}`] = "Pasirinkite iš sąrašo.";
    } else if (answer.length > 500) {
      errors[`term_${question.key}`] = "Per ilgas atsakymas (daugiausia 500 simbolių).";
    } else {
      terms[question.key] = answer;
    }
  }

  const value: DedicatedOfferInsert = {
    title,
    customer: text("customer") || null,
    truck_id: text("truck_id") || null,
    status: status as OfferStatus,
    truck_daily_cents: money("truck_daily_cents"),
    paid_km_month: paidKm,
    empty_km_month: number("empty_km_month", 100000),
    fuel_l_per_100km: number("fuel_l_per_100km", 100),
    fuel_price: number("fuel_price", 10),
    adblue_l_per_100km: number("adblue_l_per_100km", 20),
    adblue_price: number("adblue_price", 10),
    toll_per_km: number("toll_per_km", 5),
    pricing_model: model as PricingModel,
    monthly_fee_cents: money("monthly_fee_cents"),
    rate_per_km: number("rate_per_km", 20),
    min_km_month: number("min_km_month", 100000),
    margin_percent: margin,
    terms,
    notes: text("notes") || null,
  };

  if (value.truck_daily_cents <= 0 && !errors.truck_daily_cents) {
    errors.truck_daily_cents = "Pasirinkite furą arba įveskite paros savikainą.";
  }
  if (value.notes !== null && value.notes.length > 2000) errors.notes = "Pastabos per ilgos (daugiausia 2000 simbolių).";

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}
