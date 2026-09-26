/**
 * Bendra CSV rašysena (#133).
 *
 * Failai skirti lietuviškam Excel'iui, ir jis atsidaro dukart spustelėjus tik
 * laikantis trijų dalykų:
 *   - skiriamasis ženklas yra kabliataškis (lietuviškas sąrašo skirtukas);
 *   - trupmenos su kableliu — su tašku „57.50“ Excel paverčia data;
 *   - failas prasideda BOM, kitaip „Panevėžys“ virsta „PanevÄ—Å¾ys“.
 *
 * Laikoma vienoje vietoje, kad kiekviena nauja lentelė nekartotų tų pačių
 * taisyklių ir nė vienos nepamirštų.
 */

export const CSV_SEPARATOR = ";";

/** Be šito Excel nuskaito failą sistemine koduote ir sudarko lietuviškas raides. */
export const CSV_BOM = "﻿";

/** Centai į „1234,56“ — sveikaisiais, todėl be slankiojo kablelio klaidų. */
export function centsToCsv(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(absolute / 100)},${String(absolute % 100).padStart(2, "0")}`;
}

/** Dešimtainis skaičius su kableliu. Tuščias langelis, kai reikšmės nėra. */
export function decimalToCsv(value: number | null, places: number): string {
  return value === null ? "" : value.toFixed(places).replace(".", ",");
}

/**
 * Laukas su kabliataškiu, kabutėmis ar eilutės lūžiu imamas į kabutes.
 *
 * Adresai kaip „Klaipėdos g. 45, Panevėžys“ kabliataškio neturi, bet reiso
 * numeryje ar pastaboje jis pasitaiko, ir tada eilutė suskiltų į du stulpelius.
 */
export function csvField(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Antraštė ir eilutės į vieną tekstą.
 *
 * Tuščia lentelė duoda vien antraštę: failas su stulpelių vardais suprantamas,
 * o visiškai tuščias atrodo kaip klaida.
 */
export function buildCsv(columns: readonly string[], rows: readonly string[][]): string {
  return [
    columns.map(csvField).join(CSV_SEPARATOR),
    ...rows.map((row) => row.join(CSV_SEPARATOR)),
  ].join("\r\n");
}
