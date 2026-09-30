/**
 * Greita kaina (#157): iš kelių laukų – kiek prašyti.
 *
 * Forma pati užpildo tai, ką gali: kilometrus ir keliu mokesčius, paras, tuščią
 * ridą. Kiekvienas toks skaičius yra įvertis, o ne faktas, todėl čia ir
 * sprendžiama, iš ko jis paimtas ir ką apie jį pasakyti žmogui. Tyliai
 * įrašytas spėjimas būtų pelnas, kuriuo niekas netiki.
 */

export type DaysSource = "schedule" | "route" | "none";

function validDays(days: number | null): days is number {
  return days !== null && Number.isInteger(days) && days >= 1;
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
  days: number | null;
  daysSource: DaysSource;
  emptyKm: number;
  /** Furos tuščios ridos dalis iš istorijos, `null`, jei istorijos nėra. */
  emptyShare: number | null;
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

  if (input.daysSource === "schedule") {
    notes.push(`Paros: ${verb} ${input.days} – pagal PTV vairavimo laiko planą.`);
  } else if (input.daysSource === "route") {
    notes.push(
      `Paros: ${verb} ${input.days} – apytikslis spėjimas pagal kelio valandas`
      + `${input.scheduleOk ? "" : ", nes vairavimo laiko plano gauti nepavyko"}. `
      + "Pertraukos ir poilsis neįskaičiuoti.",
    );
  } else {
    notes.push("Parų nustatyti nepavyko – įrašykite jas ranka skiltyje „Pakeisti ranka“.");
  }

  if (input.emptyShare === null) {
    notes.push("Šios furos tuščios ridos istorijos nėra, todėl tušti km – 0. Jei grįšite tuščias, įrašykite ranka.");
  } else {
    notes.push(
      `Tušti km: ${verb} ${input.emptyKm} – pagal šios furos istoriją (${input.emptyShare.toFixed(0)} % visos ridos).`,
    );
  }

  if (input.ferryUnknown) {
    notes.push("Kelto bilieto kaina nežinoma ir į kainą neįskaičiuota.");
  }
  if (input.approximateAddress) {
    notes.push("Adresas rastas tik iki miesto, todėl km apytiksliai.");
  }

  return notes;
}
