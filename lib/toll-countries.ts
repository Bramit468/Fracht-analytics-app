/**
 * Sumokėti keliai pagal šalį iš Telematikos `Supplies`.
 *
 * Reisai kelius saugo viena suma (importas, PTV), todėl šalių iš jų nebėra.
 * Kortelių sąskaitos šalį turi – tai tikri pinigai, ne įkainio spėjimas.
 * Km pagal šalį Telematika neduoda, todėl €/km čia nėra.
 */

import { plateKey, type Supply } from "./telematics-costs";

export interface TollCountryRow {
  /** ISO3; `null` – sąskaitoje šalis nenurodyta. */
  country: string | null;
  costCents: number;
  payments: number;
  /** Dalis nuo visų kelių, %. `null`, kai kelių nėra. */
  sharePercent: number | null;
}

/**
 * Keliai, sumokėti furos dienomis be jokio reiso (`tripDays` – `spanDayKeys`).
 * Jų joks reisas neapmoka: tuščia rida tarp užsakymų, grįžimas, servisas.
 */
export function tollsOutsideTrips(supplies: Supply[], from: string, to: string, plate: string, tripDays: Set<string>): { costCents: number; payments: number } {
  const wantedPlate = plate ? plateKey(plate) : "";
  let costCents = 0;
  let payments = 0;
  for (const supply of supplies) {
    if (supply.kind !== "toll" || supply.date < from || supply.date > to) continue;
    const key = plateKey(supply.plate);
    if ((wantedPlate && key !== wantedPlate) || tripDays.has(`${key}|${supply.date}`)) continue;
    costCents += supply.costCents;
    payments += 1;
  }
  return { costCents, payments };
}

/** Brangiausia šalis viršuje; tuščias `plate` – visos furos. */
export function tollsByCountry(supplies: Supply[], from: string, to: string, plate = ""): TollCountryRow[] {
  const wantedPlate = plate ? plateKey(plate) : "";
  const rows = new Map<string | null, { costCents: number; payments: number }>();

  for (const supply of supplies) {
    if (supply.kind !== "toll" || supply.date < from || supply.date > to) continue;
    if (wantedPlate && plateKey(supply.plate) !== wantedPlate) continue;
    const row = rows.get(supply.country) ?? { costCents: 0, payments: 0 };
    row.costCents += supply.costCents;
    row.payments += 1;
    rows.set(supply.country, row);
  }

  const total = [...rows.values()].reduce((sum, row) => sum + row.costCents, 0);
  return [...rows.entries()]
    .map(([country, row]) => ({ country, ...row, sharePercent: total > 0 ? (row.costCents / total) * 100 : null }))
    .sort((a, b) => b.costCents - a.costCents || (a.country ?? "").localeCompare(b.country ?? ""));
}
