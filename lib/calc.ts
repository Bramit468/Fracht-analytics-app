/**
 * Reiso pelningumo skaičiavimai.
 *
 * Modelis aprašytas docs/skaiciavimo-modelis.md — prieš keičiant skaityti.
 *
 * Vienetai:
 * - pinigų sumos            -> centai, sveikas skaičius
 * - įkainiai ir normos      -> EUR, dešimtainis skaičius
 * - rodikliai už kilometrą  -> EUR/km, dešimtainis skaičius
 *
 * Kiekviena kaštų dedamoji apvalinama iki sveikų centų, o bendra suma yra
 * apvalintų dedamųjų suma. Taip vartotojui rodoma detalizacija visada
 * sutampa su iš viso — finansiniame įrankyje tai svarbiau už paskutinį centą.
 */

export type RateType = "per_km" | "flat";

export interface CountryTariff {
  country: string;
  /** EUR. Reikšmė už km arba fiksuota — priklauso nuo rateType. */
  rate: number;
  rateType: RateType;
}

export interface TripCountryLeg {
  country: string;
  km: number;
}

/**
 * Paros kaštų dedamosios, centais.
 *
 * Laikoma atskiru objektu sąmoningai: suma imama per Object.values(), todėl
 * pridėjus naują dedamąją ji į sumą patenka automatiškai. Excel'yje dedamosios
 * buvo surašytos formulėje ranka ir dvi eilutės liko nesudėtos.
 */
export interface TruckDailyCosts {
  depreciation: number;
  interest: number;
  insuranceKasko: number;
  insuranceCivil: number;
  insuranceCmr: number;
  driverSalary: number;
  perDiem: number;
  repairs: number;
  management: number;
}

export interface Truck {
  dailyCents: TruckDailyCosts;
  /** Priekabos nuoma per mėnesį, centais. */
  trailerMonthlyCents: number;
  /**
   * Iš kiek parų dalinama mėnesinė priekabos nuoma. Nuo 0017 – `DAYS_PER_MONTH`:
   * fura kainuoja kiekvieną kalendorinę parą, ne tik darbo dieną. Seni reisai
   * įšaldyti su 22, todėl laukas lieka kopijoje, o ne konstanta skaičiavime.
   */
  workingDaysPerMonth: number;
}

/**
 * Vidutinis kalendorinis mėnuo, paromis. Paros sumos įvedamos kaip metų suma
 * / 365, tad mėnesinė priekaba verčiama tuo pačiu matu: × 12 / 365.
 */
export const DAYS_PER_MONTH = 365 / 12;

/** Atskiri kelio mokesčiai, centais. Sumuojami per Object.values(). */
export interface RoadExtras {
  bridgesCents: number;
  ferriesCents: number;
  tunnelsCents: number;
  parkingCents: number;
}

export interface ConsumableInput {
  totalKm: number;
  litresPer100Km: number;
  pricePerLitre: number;
}

export type RevenueInput =
  | { mode: "per_km"; ratePerKm: number }
  | { mode: "freight"; freightPriceCents: number };

export interface TripInput {
  truck: Truck;
  /** Kiek parų truko reisas. */
  days: number;
  paidKm: number;
  emptyKm: number;
  fuel: Omit<ConsumableInput, "totalKm">;
  adblue: Omit<ConsumableInput, "totalKm">;
  legs: TripCountryLeg[];
  extras: RoadExtras;
  revenue: RevenueInput;
  tariffs: CountryTariff[];
  /**
   * Dienpinigiai pagal šalis visam reisui, centais (#187). Kai paduota, jie
   * pakeičia furos fiksuotą `perDiem` × paros. `null` arba nėra – senas būdas.
   */
  perDiemCents?: number | null;
}

export interface TripResult {
  totalKm: number;
  fuelCents: number;
  adblueCents: number;
  roadCents: number;
  /** Furos kaštai reisui, dienpinigiai įskaičiuoti. */
  truckCents: number;
  /** Kiek iš `truckCents` sudaro dienpinigiai – fiksuoti arba pagal šalis. */
  perDiemCents: number;
  totalCostCents: number;
  revenueCents: number;
  profitCents: number;
  /** Procentais. null, kai pajamos lygios nuliui. */
  marginPercent: number | null;
  /** EUR/km. null, kai apmokamų km nėra. */
  costPerKm: number | null;
  /** EUR/km. null, kai apmokamų km nėra. */
  profitPerKm: number | null;
  /** Centai per parą. null, kai parų nėra. */
  profitPerDayCents: number | null;
}

/** EUR -> centai. */
function toCents(eur: number): number {
  return Math.round(eur * 100);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Furos paros savikaina centais.
 *
 * Paros dedamosios sudedamos, priekabos mėnesinė nuoma dalinama iš darbo dienų.
 */
export function calcDailyRate(truck: Truck): number {
  if (!(truck.workingDaysPerMonth > 0)) {
    throw new Error(
      `workingDaysPerMonth turi būti didesnis už nulį, gauta: ${truck.workingDaysPerMonth}`,
    );
  }
  const trailerPerDay = Math.round(truck.trailerMonthlyCents / truck.workingDaysPerMonth);
  return sum(Object.values(truck.dailyCents)) + trailerPerDay;
}

/** Sunaudojamos medžiagos kaštai centais (kuras, AdBlue). */
export function calcConsumableCost({
  totalKm,
  litresPer100Km,
  pricePerLitre,
}: ConsumableInput): number {
  const litres = (totalKm * litresPer100Km) / 100;
  return toCents(litres * pricePerLitre);
}

/** Kuro kaštai centais. Skaičiuojama nuo VISO kilometražo, su tuščiais km. */
export function calcFuelCost(input: ConsumableInput): number {
  return calcConsumableCost(input);
}

/** AdBlue kaštai centais. Skaičiuojama nuo VISO kilometražo. */
export function calcAdblueCost(input: ConsumableInput): number {
  return calcConsumableCost(input);
}

/**
 * Kelių kaštai centais: šalių atkarpos + atskiri mokesčiai.
 *
 * Nežinoma šalis meta klaidą, o ne tyliai prideda nulį. Tylus nulis yra
 * būtent ta klaida, dėl kurios Excel rodė per didelį pelną.
 */
export function calcRoadCost(
  legs: TripCountryLeg[],
  tariffs: CountryTariff[],
  extras: RoadExtras,
): number {
  const byCountry = new Map(tariffs.map((tariff) => [tariff.country, tariff]));

  const legsCents = sum(
    legs.map((leg) => {
      const tariff = byCountry.get(leg.country);
      if (!tariff) {
        throw new Error(`Nežinoma šalis įkainių žinyne: ${leg.country}`);
      }
      return toCents(tariff.rateType === "per_km" ? tariff.rate * leg.km : tariff.rate);
    }),
  );

  return legsCents + sum(Object.values(extras));
}

/** Furos kaštai reisui centais: paros kaina × dienos. Paros būna trupmenomis, todėl apvalinama. */
export function calcTruckCost(truck: Truck, days: number): number {
  return Math.round(calcDailyRate(truck) * days);
}

/** Bendri reiso kaštai centais. */
export function calcTotalCost(parts: {
  roadCents: number;
  fuelCents: number;
  adblueCents: number;
  truckCents: number;
}): number {
  return sum(Object.values(parts));
}

/** Pajamos centais. Tušti km neapmokami. */
export function calcRevenue(revenue: RevenueInput, paidKm: number): number {
  return revenue.mode === "per_km"
    ? toCents(paidKm * revenue.ratePerKm)
    : revenue.freightPriceCents;
}

/** Pelnas centais. Nuostolis grąžinamas kaip neigiamas skaičius, ne nulis. */
export function calcProfit(revenueCents: number, totalCostCents: number): number {
  return revenueCents - totalCostCents;
}

/** Pelno marža procentais. null, kai pajamų nėra. */
export function calcMargin(profitCents: number, revenueCents: number): number | null {
  if (revenueCents === 0) return null;
  return (profitCents / revenueCents) * 100;
}

/** Savikaina EUR/km. Dalinama iš APMOKAMŲ km. null, kai jų nėra. */
export function calcCostPerKm(totalCostCents: number, paidKm: number): number | null {
  if (paidKm <= 0) return null;
  return totalCostCents / 100 / paidKm;
}

/** Pelnas EUR/km. Dalinama iš APMOKAMŲ km. null, kai jų nėra. */
export function calcProfitPerKm(profitCents: number, paidKm: number): number | null {
  if (paidKm <= 0) return null;
  return profitCents / 100 / paidKm;
}

/**
 * Pelnas per parą centais (#179). null, kai parų nėra.
 *
 * Pelnas už km lėtą krovinį rodo kaip gerą: 3000 km per 3 paras ir per 5 paras
 * duoda tą patį €/km, nors antras reisas fura užima dviem paromis ilgiau ir
 * per tas paras kito krovinio nebeveža. Fura uždirba paromis, todėl lyginti
 * reikia ir taip.
 */
export function calcProfitPerDay(profitCents: number, days: number): number | null {
  if (!(days > 0)) return null;
  return Math.round(profitCents / days);
}

/** Visas reiso skaičiavimas nuo įvesties iki rodiklių. */
export function calcTrip(input: TripInput): TripResult {
  const totalKm = input.paidKm + input.emptyKm;

  const fuelCents = calcFuelCost({ totalKm, ...input.fuel });
  const adblueCents = calcAdblueCost({ totalKm, ...input.adblue });
  const roadCents = calcRoadCost(input.legs, input.tariffs, input.extras);
  // Dienpinigiai pagal šalis pakeičia fiksuotą furos paros sumą, o ne
  // prisideda prie jos – kitaip jie būtų suskaičiuoti du kartus.
  const fixedPerDiemCents = Math.round(input.truck.dailyCents.perDiem * input.days);
  const perDiemCents = input.perDiemCents ?? fixedPerDiemCents;
  const truckCents = calcTruckCost(input.truck, input.days) - fixedPerDiemCents + perDiemCents;

  const totalCostCents = calcTotalCost({ roadCents, fuelCents, adblueCents, truckCents });
  const revenueCents = calcRevenue(input.revenue, input.paidKm);
  const profitCents = calcProfit(revenueCents, totalCostCents);

  return {
    totalKm,
    fuelCents,
    adblueCents,
    roadCents,
    truckCents,
    perDiemCents,
    totalCostCents,
    revenueCents,
    profitCents,
    marginPercent: calcMargin(profitCents, revenueCents),
    costPerKm: calcCostPerKm(totalCostCents, input.paidKm),
    profitPerKm: calcProfitPerKm(profitCents, input.paidKm),
    profitPerDayCents: calcProfitPerDay(profitCents, input.days),
  };
}

/**
 * Su kuo lyginamas krovinys: ką fura darytų, jei jo neimtume. Įvedama ranka,
 * nes programa to nežino – stovėtų (0 parų, 0 €) ar grįžtų tuščia (paros ir
 * minusas kuras su keliais).
 */
export interface Alternative {
  /** Kiek parų fura užimtų alternatyva. */
  days: number;
  /** Alternatyvos įnašas centais; grįžimas tuščiam yra neigiamas. */
  contributionCents: number;
  /** Kiek įnašas turi viršyti alternatyvą, kad verta imti, centais. */
  thresholdCents: number;
}

/**
 * Ar imti krovinį. Žemiausia kaina – savikaina: žemiau jos važiuojama tik su
 * vadovo pritarimu ir tik tada, kai krovinys padengia kintamus kaštus ir yra
 * geresnis už alternatyvą (pvz. grįžimą tuščiam).
 */
export type LoadVerdict = "take" | "approval" | "reject";

export function loadVerdict(profitCents: number, vsAlternativeCents: number, thresholdCents: number): LoadVerdict {
  if (profitCents >= 0) return "take";
  return vsAlternativeCents > thresholdCents ? "approval" : "reject";
}

export interface ContributionResult {
  /** Paros, kurių fura neužimtų alternatyva. */
  extraDays: number;
  /** Dienpinigiai tik papildomoms paroms. */
  perDiemExtraCents: number;
  /** Kuras + AdBlue + keliai + papildomų parų dienpinigiai. */
  variableCents: number;
  /** Pajamos − kintami kaštai. Pastovūs furos kaštai čia neįeina. */
  contributionCents: number;
  /** Įnašas − alternatyvos įnašas. */
  vsAlternativeCents: number;
  /** Įnašas viršija alternatyvą bent riba – be savikainos patikros. */
  take: boolean;
  verdict: LoadVerdict;
  /** Žemiau savikainos, su vadovo pritarimu, kaina turi būti didesnė už šią. */
  breakEvenPriceCents: number;
}

/**
 * Ar imti krovinį (įnašas). Nusidėvėjimas, draudimai, atlyginimas, remontas,
 * vadyba ir priekaba mokami vis tiek, imsim ar ne, todėl sprendimui jie
 * nesvarbūs – jie lieka pilname pelne. Dienpinigiai mokami tik už paras, kurių
 * nebūtų be šio krovinio.
 */
export function calcContribution(result: TripResult, days: number, alternative: Alternative): ContributionResult {
  const extraDays = Math.max(0, days - Math.max(0, alternative.days));
  const perDiemExtraCents = days > 0 ? Math.round((result.perDiemCents * extraDays) / days) : 0;
  const variableCents = result.fuelCents + result.adblueCents + result.roadCents + perDiemExtraCents;
  const contributionCents = result.revenueCents - variableCents;
  const vsAlternativeCents = contributionCents - alternative.contributionCents;
  return {
    extraDays,
    perDiemExtraCents,
    variableCents,
    contributionCents,
    vsAlternativeCents,
    take: vsAlternativeCents > alternative.thresholdCents,
    verdict: loadVerdict(result.profitCents, vsAlternativeCents, alternative.thresholdCents),
    breakEvenPriceCents: variableCents + alternative.contributionCents + alternative.thresholdCents,
  };
}
