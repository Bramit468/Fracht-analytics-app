/**
 * Dienpinigiai pagal šalis (#187).
 *
 * Iki šiol dienpinigiai buvo viena fiksuota furos paros suma, nors norma
 * priklauso nuo šalies: diena Lenkijoje – 48 €, Nyderlanduose – 64 €. Reisui į
 * Vakarus ir į Baltijos šalis savikaina dėl to skiriasi dešimtimis eurų.
 *
 * Taisyklės – LRV nutarimo Nr. 526 Dienpinigių mokėjimo tvarkos aprašo 3 p.:
 *   - išvykimo dieną mokama pagal valstybę, į kurią vykstama;
 *   - grįžimo dieną – pagal valstybę, iš kurios grįžtama;
 *   - dieną, kai vykstama į kelias valstybes, – jų normų vidurkis.
 * Todėl Lietuva dieną, kai fura buvo ir užsienyje, neskaičiuojama: tai
 * išvykimo arba grįžimo diena. Diena vien Lietuvoje – Lietuvos norma, o
 * reisas vien Lietuvoje, trunkantis vieną dieną, dienpinigių neturi (2² p.).
 *
 * Ko neįvertiname: pirmos ir paskutinės komandiruotės dienos trumpiau nei
 * 4 val. – 20 % (2¹ p.). Komandiruotė apima kelis reisus, ir kuris reisas
 * pirmas, iš vieno reiso nematyti.
 *
 * Šalys kiekvieną dieną imamos iš PTV tvarkaraščio: išvykimo šalis ir sienų
 * kirtimai su laiku. Kalendorinė diena – pagal tą laiko juostą, kurioje PTV
 * grąžina laikus (išvykimo vietos).
 */

import { perDiemNormCents } from "./per-diem-norms";

const HOME = "LT";

export interface BorderCrossing {
  /** ISO laikas su laiko juosta, kaip grąžina PTV. */
  startsAt: string;
  /** Šalis, į kurią įvažiuojama. */
  countryCode: string;
}

export interface CountryTimeline {
  startTime: string;
  endTime: string;
  startCountry: string;
  borders: BorderCrossing[];
}

/** Viena reiso diena: šalys, pagal kurias mokama, ir suma centais (jau su įmonės %). */
export interface PerDiemDay {
  countries: string[];
  cents: number;
}

function datePart(iso: string): string {
  return iso.slice(0, 10);
}

function nextDate(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

/** Kiekvienai kalendorinei reiso dienai – šalys, kuriose fura tą dieną buvo, eilės tvarka. */
export function countriesByDay(timeline: CountryTimeline): string[][] {
  const first = datePart(timeline.startTime);
  const last = datePart(timeline.endTime);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first) || !/^\d{4}-\d{2}-\d{2}$/.test(last) || last < first) return [];

  const borders = [...timeline.borders].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const days: string[][] = [];
  let current = timeline.startCountry.toUpperCase();

  for (let date = first; date <= last; date = nextDate(date)) {
    const present = [current];
    for (const border of borders) {
      if (datePart(border.startsAt) !== date) continue;
      current = border.countryCode.toUpperCase();
      if (!present.includes(current)) present.push(current);
    }
    days.push(present);
  }
  return days;
}

/** Šalys, pagal kurias mokama konkrečią dieną (žr. taisykles viršuje). */
function payableCountries(day: string[], index: number, all: string[][]): string[] {
  const foreign = day.filter((country) => country !== HOME);
  if (foreign.length > 0) return foreign;

  // Diena vien Lietuvoje, bet reisas eina į užsienį: išvykimo diena – pagal
  // valstybę, į kurią vykstama, grįžimo – iš kurios grįžtama.
  const later = all.slice(index + 1).flat().find((country) => country !== HOME);
  const earlier = all.slice(0, index).flat().reverse().find((country) => country !== HOME);
  if (index === 0 && later) return [later];
  if (index === all.length - 1 && earlier) return [earlier];
  return [HOME];
}

export interface PerDiemResult {
  days: PerDiemDay[];
  totalCents: number;
  /** Šalys, kurių normos nežinome. Kol jų yra, suma netaikoma. */
  unknownCountries: string[];
}

/**
 * Dienpinigiai kiekvienai dienai. `percent` – kiek normos moka įmonė
 * (kolektyvinė sutartis gali sumažinti iki 50 %).
 */
export function perDiemDays(byDay: string[][], percent: number): PerDiemResult {
  const unknown = new Set<string>();
  const days: PerDiemDay[] = byDay.map((day, index) => {
    const countries = payableCountries(day, index, byDay);
    const norms = countries.map((country) => {
      const norm = perDiemNormCents(country);
      if (norm === null) unknown.add(country);
      return norm ?? 0;
    });
    const average = norms.reduce((total, norm) => total + norm, 0) / norms.length;
    return { countries, cents: Math.round((average * percent) / 100) };
  });

  // Reisas vien Lietuvoje, trunkantis vieną dieną, dienpinigių neturi.
  if (days.length === 1 && days[0].countries.length === 1 && days[0].countries[0] === HOME) {
    days[0] = { countries: [HOME], cents: 0 };
  }

  return { days, totalCents: sumPerDiem(days), unknownCountries: [...unknown] };
}

export function sumPerDiem(days: PerDiemDay[]): number {
  return days.reduce((total, day) => total + day.cents, 0);
}

/**
 * Pritaiko dienas prie reiso trukmės, kai ji skiriasi nuo PTV plano (pvz.
 * laukta pakrovimo). Papildomos dienos – kaip paskutinė (fura ten ir laukia),
 * o trumpinant paliekama paskutinė diena, nes joje – paskirties šalis.
 */
export function fitPerDiemDays(days: PerDiemDay[], tripDays: number): PerDiemDay[] {
  if (!(tripDays > 0) || days.length === 0) return [];
  if (days.length === tripDays) return days;
  if (days.length > tripDays) return [...days.slice(0, tripDays - 1), days[days.length - 1]];
  const last = days[days.length - 1];
  return [...days, ...Array.from({ length: tripDays - days.length }, () => ({ ...last, countries: [...last.countries] }))];
}

export type ParsedPerDiemPercent = { ok: true; value: number | null } | { ok: false; error: string };

/**
 * Įmonės dienpinigių procentas. Tuščias – dienpinigiai pagal šalis
 * neskaičiuojami (lieka fiksuota furos paros suma). Mažiau nei 50 % nutarimas
 * neleidžia net kolektyvine sutartimi.
 */
export function parsePerDiemPercent(text: string): ParsedPerDiemPercent {
  const trimmed = text.trim().replace(/\s*%$/, "");
  if (trimmed === "") return { ok: true, value: null };
  const value = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(value) || value < 50 || value > 100) {
    return { ok: false, error: "Nuo 50 iki 100 %. Mažiau nutarimas Nr. 526 neleidžia." };
  }
  return { ok: true, value: Math.round(value * 100) / 100 };
}
