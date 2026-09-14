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
  /** Daliklis mėnesiniams dydžiams. Įprastai 22. */
  workingDaysPerMonth: number;
}

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
}

export interface TripResult {
  totalKm: number;
  fuelCents: number;
  adblueCents: number;
  roadCents: number;
  truckCents: number;
  totalCostCents: number;
  revenueCents: number;
  profitCents: number;
  /** Procentais. null, kai pajamos lygios nuliui. */
  marginPercent: number | null;
  /** EUR/km. null, kai apmokamų km nėra. */
  costPerKm: number | null;
  /** EUR/km. null, kai apmokamų km nėra. */
  profitPerKm: number | null;
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

/** Furos kaštai reisui centais: paros kaina × dienos. */
export function calcTruckCost(truck: Truck, days: number): number {
  return calcDailyRate(truck) * days;
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

/** Visas reiso skaičiavimas nuo įvesties iki rodiklių. */
export function calcTrip(input: TripInput): TripResult {
  const totalKm = input.paidKm + input.emptyKm;

  const fuelCents = calcFuelCost({ totalKm, ...input.fuel });
  const adblueCents = calcAdblueCost({ totalKm, ...input.adblue });
  const roadCents = calcRoadCost(input.legs, input.tariffs, input.extras);
  const truckCents = calcTruckCost(input.truck, input.days);

  const totalCostCents = calcTotalCost({ roadCents, fuelCents, adblueCents, truckCents });
  const revenueCents = calcRevenue(input.revenue, input.paidKm);
  const profitCents = calcProfit(revenueCents, totalCostCents);

  return {
    totalKm,
    fuelCents,
    adblueCents,
    roadCents,
    truckCents,
    totalCostCents,
    revenueCents,
    profitCents,
    marginPercent: calcMargin(profitCents, revenueCents),
    costPerKm: calcCostPerKm(totalCostCents, input.paidKm),
    profitPerKm: calcProfitPerKm(profitCents, input.paidKm),
  };
}
