/**
 * Greita kaina (#157): iš kelių laukų – kiek prašyti.
 *
 * Forma pati užpildo tai, ką gali: kilometrus ir keliu mokesčius, paras, tuščią
 * ridą. Kiekvienas toks skaičius yra įvertis, o ne faktas, todėl čia ir
 * sprendžiama, iš ko jis paimtas ir ką apie jį pasakyti žmogui. Tyliai
 * įrašytas spėjimas būtų pelnas, kuriuo niekas netiki.
 */

import type { RouteFuelPrice } from "./fuel-prices";
import type { StopType } from "./stops";

export type DaysSource = "schedule" | "route" | "none";

function validDays(days: number | null): days is number {
  return days !== null && Number.isFinite(days) && days > 0;
}

/** Numatytasis vieno pakrovimo ar iškrovimo laikas, valandomis. Formoje keičiamas. */
export const SERVICE_HOURS_PER_STOP = 2;

const SERVICE_STOPS: readonly StopType[] = ["loading", "unloading", "extra_loading", "extra_unloading"];

/** Pakrovimų ir iškrovimų laikas valandomis. Muitinė, CMR ir kiti – 0. */
export function serviceHours(stopTypes: StopType[], hoursPerStop: number): number {
  if (!(hoursPerStop > 0)) return 0;
  return stopTypes.filter((type) => SERVICE_STOPS.includes(type)).length * hoursPerStop;
}

/** Valandos tarp dviejų PTV laikų (su laiko juosta). `null`, kai neperskaitomi. */
export function hoursBetween(start: string, end: string): number | null {
  const hours = (Date.parse(end) - Date.parse(start)) / 3_600_000;
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

/**
 * Paros trupmenomis: kelio trukmė paromis + pakrovimas ir iškrovimas.
 * Apvalinant iki sveikų parų 2,1 paros reisas kainuotų kaip 3.
 */
export function quoteDays(baseDays: number | null, serviceHoursTotal: number): number | null {
  if (baseDays === null || !Number.isFinite(baseDays) || baseDays < 0) return null;
  const days = Math.round((baseDays + Math.max(0, serviceHoursTotal) / 24) * 100) / 100;
  return days > 0 ? days : null;
}

/**
 * Keliai tuštiems km pagal pakrauto maršruto vidurkį €/km. Tikro privažiavimo
 * maršruto nėra, o nulis reikštų, kad tuščia fura važiuoja nemokamais keliais.
 */
export function emptyKmTollCents(routeTollCents: number, paidKm: number, emptyKm: number): number {
  if (!(paidKm > 0) || !(emptyKm > 0) || !(routeTollCents > 0)) return 0;
  return Math.round((routeTollCents * emptyKm) / paidKm);
}

/**
 * Kiek parų įrašyti.
 *
 * Pirma vairavimo laiko planas (pertraukos ir poilsis įskaičiuoti), tada
 * maršruto spėjimas (kelio valandos, dalintos iš 9). Paros yra didžioji kaštų
 * dalis, todėl kartu grąžinamas ir šaltinis – jis rodomas prie lauko.
 */
export function pickDays(
  scheduleDays: number | null,
  routeDays: number | null,
): { days: number | null; source: DaysSource } {
  if (validDays(scheduleDays)) return { days: scheduleDays, source: "schedule" };
  if (validDays(routeDays)) return { days: routeDays, source: "route" };
  return { days: null, source: "none" };
}

/**
 * Tušti km pagal furos istoriją.
 *
 * `sharePercent` yra tuščios ridos dalis nuo **visos** ridos (taip ją skaičiuoja
 * `lib/empty-km.ts`), todėl tušti = apmokami × dalis / (100 − dalis), o ne
 * apmokami × dalis. `0`, kai istorijos nėra arba dalis neįmanoma; apie tai
 * žmogui pasako `quoteNotes`, nes nulis čia yra „nežinome", o ne „tuščių nebus".
 */
export function defaultEmptyKm(paidKm: number, sharePercent: number | null): number {
  if (!(paidKm > 0) || sharePercent === null) return 0;
  if (!(sharePercent > 0) || sharePercent >= 100) return 0;
  return Math.round(((paidKm * sharePercent) / (100 - sharePercent)) * 100) / 100;
}

export interface QuoteNoteInput {
  /** `false` redaguojant išsaugotą reisą: laukai nekeičiami, skaičiai tik siūlomi. */
  applied: boolean;
  routeOk: boolean;
  scheduleOk: boolean;
  /** Plano neprašyta, nes nėra išvykimo datos ar laiko – tai ne gedimas. */
  noDeparture?: boolean;
  days: number | null;
  daysSource: DaysSource;
  emptyKm: number;
  /** Keliai tuštiems km, centais. */
  emptyTollCents?: number;
  /** Pakrovimų ir iškrovimų valandos, įskaičiuotos į paras. */
  serviceHours?: number;
  /** Kuro kaina pagal maršruto šalis; `null` – liko furos praėjusio mėnesio. */
  routeFuel?: RouteFuelPrice | null;
  /** Furos tuščios ridos dalis iš istorijos, `null`, jei istorijos nėra. */
  emptyShare: number | null;
  /** Tušti km iš tikro kelio iki pakrovimo (`emptyRunNote`) – tada istorija nerodoma. */
  emptyRunNote?: string;
  ferryUnknown: boolean;
  approximateAddress: boolean;
}

/** Viskas, kas kainoje yra spėjimas – po vieną eilutę, lietuviškai. */
export function quoteNotes(input: QuoteNoteInput): string[] {
  const notes: string[] = [];
  const verb = input.applied ? "įrašyta" : "siūloma";

  if (!input.applied) {
    notes.push("Redaguojamas išsaugotas reisas: laukai nepakeisti, žemiau tik pasiūlymai.");
  }
  if (!input.routeOk) {
    notes.push("Maršruto suskaičiuoti nepavyko – kaina remiasi laukuose esančiais km ir keliais.");
  }

  const days = String(input.days).replace(".", ",");
  if (input.daysSource === "schedule") {
    notes.push(`Paros: ${verb} ${days} – pagal PTV vairavimo laiko planą.`);
  } else if (input.daysSource === "route") {
    notes.push(
      `Paros: ${verb} ${days} – apytikslis spėjimas pagal kelio valandas`
      + `${input.scheduleOk ? "" : input.noDeparture
        ? ", nes neįvesta reiso data ar išvykimo laikas – su jais paros būtų pagal vairavimo laiko planą"
        : ", nes vairavimo laiko plano gauti nepavyko"}. `
      + "Pertraukos ir poilsis neįskaičiuoti.",
    );
  } else {
    notes.push("Parų nustatyti nepavyko – įrašykite jas ranka skiltyje „Pakeisti ranka“.");
  }
  if (input.days !== null && input.serviceHours) {
    notes.push(`Į paras įskaičiuota ${String(input.serviceHours).replace(".", ",")} val. pakrovimui ir iškrovimui.`);
  }

  if (input.emptyRunNote) {
    notes.push(input.emptyRunNote);
  } else if (input.emptyShare === null) {
    notes.push("Šios furos tuščios ridos istorijos nėra, todėl tušti km – 0. Jei grįšite tuščias, įrašykite ranka.");
  } else {
    notes.push(
      `Tušti km: ${verb} ${input.emptyKm} – pagal šios furos istoriją (${input.emptyShare.toFixed(0)} % visos ridos).`
      + (input.emptyTollCents ? ` Keliai jiems ${(input.emptyTollCents / 100).toFixed(2).replace(".", ",")} € – pagal maršruto vidurkį €/km.` : ""),
    );
  }

  if (input.routeFuel) {
    const price = (value: number) => value.toFixed(3).replace(".", ",");
    notes.push(
      `Kuro kaina: ${verb} ${price(input.routeFuel.pricePerL)} €/l – pagal maršruto šalis: `
      + input.routeFuel.rows
        .map((row) => `${row.countryCode} ${Math.round(row.km)} km ${price(row.pricePerL)}${row.fleetAverage ? " (įmonės vidurkis)" : ""}`)
        .join(", ")
      + ".",
    );
  } else if (input.routeFuel === null) {
    notes.push("Kuro kaina – furos praėjusių 30 d., nes maršruto šalių kainų gauti nepavyko.");
  }

  if (input.ferryUnknown) {
    notes.push("Kelto bilieto kaina nežinoma ir į kainą neįskaičiuota.");
  }
  if (input.approximateAddress) {
    notes.push("Adresas rastas tik iki miesto, todėl km apytiksliai.");
  }

  return notes;
}
