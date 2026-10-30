/**
 * Prastovų kaštai: fura kainuoja kiekvieną dieną, o reisai jos paros kaštus
 * neša tik savo dienomis. Dienos be reiso – vairuotojo atlyginimas,
 * nusidėvėjimas, palūkanos, draudimas, valdymas ir priekaba, kurių joks reisas
 * neapmoka. Remontas ir dienpinigiai neįeina: stovint jų beveik nėra.
 *
 * Kaštai – dabartiniai furos (ne reisų kopija): prastova reiso neturi.
 */

import { addDays } from "./trip-progress";
import { DAYS_PER_MONTH, type Truck } from "./calc";
import { plateKey } from "./telematics-costs";

/** Kas lieka mokėti stovinčiai furai, centais per parą. */
export function idleDailyCents(truck: Truck): number {
  const d = truck.dailyCents;
  return d.depreciation + d.interest + d.insuranceKasko + d.insuranceCivil + d.insuranceCmr
    + d.driverSalary + d.management + Math.round(truck.trailerMonthlyCents / DAYS_PER_MONTH);
}

export interface IdleRow {
  plate: string;
  idleDays: number;
  dailyCents: number;
  costCents: number;
}

/**
 * Kiekvienos furos dienos be reiso nuo `from` iki `to` imtinai, brangiausia
 * viršuje. `tripDays` – `spanDayKeys` iš visų reisų.
 */
export function idleCosts(trucks: { plate: string; dailyCents: number }[], tripDays: Set<string>, from: string, to: string): IdleRow[] {
  const rows = trucks.map(({ plate, dailyCents }) => {
    let idleDays = 0;
    for (let date = from; date <= to; date = addDays(date, 1)) {
      if (!tripDays.has(`${plateKey(plate)}|${date}`)) idleDays += 1;
    }
    return { plate, idleDays, dailyCents, costCents: idleDays * dailyCents };
  });
  return rows.filter((row) => row.idleDays > 0).sort((a, b) => b.costCents - a.costCents || a.plate.localeCompare(b.plate));
}
