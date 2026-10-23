/**
 * „Kur dingsta pinigai“: kaštų struktūra pagal dedamąsias.
 *
 * Furos paros kaina reise yra viena suma, bet derėtis ir taupyti galima tik
 * žinant, iš ko ji susideda. Dedamosios imamos iš reiso kaštų kopijos, todėl
 * seni reisai nepasikeičia, o jų suma lygi reiso kaštams (CLAUDE.md taisyklė).
 */

import type { TripResult, Truck } from "./calc";
import type { TripSummary } from "./trips";

export const COST_LINES = [
  { key: "drivers", label: "Vairuotojai" },
  { key: "perDiem", label: "Dienpinigiai" },
  { key: "truck", label: "Fura (nusidėv., palūk., draud.)" },
  { key: "repairs", label: "Remontas" },
  { key: "management", label: "Valdymas" },
  { key: "trailer", label: "Priekaba" },
  { key: "fuel", label: "Kuras" },
  { key: "adblue", label: "AdBlue" },
  { key: "roads", label: "Keliai" },
] as const;

export type CostLine = (typeof COST_LINES)[number]["key"];
export type CostBreakdown = Record<CostLine, number>;

/**
 * Reiso kaštai pagal dedamąsias, centais. Neapvalinama: importuotų reisų paros
 * trupmeninės, todėl ir `truckCents` gali būti trupmeninis, o suma turi sutapti.
 */
export function tripCostBreakdown(truck: Truck, days: number, result: TripResult): CostBreakdown {
  const daily = truck.dailyCents;
  // Kaip calcDailyRate: priekabos paros kaina apvalinama prieš dauginant iš parų.
  const trailerPerDay = truck.workingDaysPerMonth > 0 ? Math.round(truck.trailerMonthlyCents / truck.workingDaysPerMonth) : 0;
  return {
    drivers: daily.driverSalary * days,
    // Dienpinigiai pagal šalis pakeičia fiksuotus – imama tai, kas reise įskaičiuota.
    perDiem: result.perDiemCents,
    truck: (daily.depreciation + daily.interest + daily.insuranceKasko + daily.insuranceCivil + daily.insuranceCmr) * days,
    repairs: daily.repairs * days,
    management: daily.management * days,
    trailer: trailerPerDay * days,
    fuel: result.fuelCents,
    adblue: result.adblueCents,
    roads: result.roadCents,
  };
}

export interface CostStructureRow {
  key: CostLine;
  label: string;
  cents: number;
  /** Centai per furos parą. `null`, kai parų nėra. */
  perDayCents: number | null;
  /** Dalis nuo visų kaštų, %. `null`, kai kaštų nėra. */
  sharePercent: number | null;
}

/** Laikotarpio struktūra, didžiausia dedamoji viršuje. Tuščios eilutės nerodomos. */
export function costStructure(trips: TripSummary[]): CostStructureRow[] {
  const totals = Object.fromEntries(COST_LINES.map(({ key }) => [key, 0])) as CostBreakdown;
  let days = 0;
  for (const trip of trips) {
    if (!trip.costs) continue;
    days += trip.days;
    for (const { key } of COST_LINES) totals[key] += trip.costs[key];
  }
  const total = COST_LINES.reduce((sum, { key }) => sum + totals[key], 0);
  return COST_LINES
    .map(({ key, label }) => ({
      key,
      label,
      cents: totals[key],
      perDayCents: days > 0 ? Math.round(totals[key] / days) : null,
      sharePercent: total > 0 ? (totals[key] / total) * 100 : null,
    }))
    .filter((row) => Math.round(row.cents) !== 0)
    .sort((a, b) => b.cents - a.cents);
}
