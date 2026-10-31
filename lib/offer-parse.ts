/**
 * Įklijuotas krovinio pasiūlymas (Timocom, Trans.eu, el. laiškas) -> formos laukai.
 *
 * Pirma taisyklės: jos nemokamos ir akimirksniu. Ko taisyklės nerado, paklausiama
 * AI (`lib/offer-ai.ts`), bet jo atsakymas tikrinamas tais pačiais
 * skaitytuvais: data, kaina ir miestas turi būti tekste, kitaip jie išgalvoti.
 *
 * Nieko neatmetama tyliai: neperskaitytos eilutės grąžinamos `unparsed`, o
 * ne eurų kaina neperskaičiuojama – ji paliekama tuščia su įspėjimu.
 */

export type OfferSource = "timocom" | "transeu" | "unknown";

export interface OfferPlace {
  /** ISO2, pvz. „LT“. */
  country: string | null;
  postalCode: string | null;
  city: string | null;
}

export interface OfferStop {
  kind: "loading" | "unloading";
  place: OfferPlace;
}

export interface OfferFields {
  source: OfferSource;
  loading: OfferPlace | null;
  unloading: OfferPlace | null;
  /** Papildomi sustojimai tarp pirmo pakrovimo ir paskutinio iškrovimo. */
  extraStops: OfferStop[];
  /** YYYY-MM-DD. */
  loadingDate: string | null;
  /** HH:MM – pakrovimo lango pradžia. */
  loadingTime: string | null;
  unloadingDate: string | null;
  /** Tik eurais; kita valiuta – `null`, o `currency` pasako kokia. */
  priceCents: number | null;
  currency: string | null;
  weightKg: number | null;
  ldm: number | null;
  pallets: number | null;
}

export type OfferFieldName = Exclude<keyof OfferFields, "source" | "extraStops">;

export interface ParsedOffer {
  fields: OfferFields;
  /** „high“ – iš pažymėtos eilutės, „low“ – spėta iš teksto be pavadinimo. */
  confidence: Partial<Record<OfferFieldName, "high" | "low">>;
  /** Eilutės, iš kurių nieko nepaimta. */
  unparsed: string[];
}

/** Daugiau AI nesiunčiama – pasiūlymas niekada nebūna toks ilgas. */
export const MAX_OFFER_TEXT = 4000;

const COUNTRIES = [
  "AT", "BE", "BG", "BY", "CH", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GB", "GR", "HR", "HU",
  "IE", "IT", "LT", "LU", "LV", "NL", "NO", "PL", "PT", "RO", "RS", "SE", "SI", "SK", "UA", "UK",
];

const COUNTRY_NAMES: Record<string, string> = {
  lithuania: "LT", lietuva: "LT", litauen: "LT", litwa: "LT",
  latvia: "LV", latvija: "LV", lettland: "LV", łotwa: "LV",
  estonia: "EE", eesti: "EE", estland: "EE",
  poland: "PL", polska: "PL", polen: "PL", lenkija: "PL",
  germany: "DE", deutschland: "DE", niemcy: "DE", vokietija: "DE",
  netherlands: "NL", nederland: "NL", holland: "NL", niederlande: "NL", olandija: "NL",
  belgium: "BE", belgien: "BE", belgia: "BE", belgija: "BE",
  france: "FR", frankreich: "FR", francja: "FR", prancūzija: "FR",
  czechia: "CZ", "czech republic": "CZ", tschechien: "CZ", czechy: "CZ", čekija: "CZ",
  spain: "ES", spanien: "ES", hiszpania: "ES", ispanija: "ES",
  italy: "IT", italien: "IT", włochy: "IT", italija: "IT",
  sweden: "SE", schweden: "SE", szwecja: "SE", švedija: "SE",
  norway: "NO", norwegen: "NO", norwegia: "NO", norvegija: "NO",
  denmark: "DK", dänemark: "DK", dania: "DK", danija: "DK",
  finland: "FI", finnland: "FI", finlandia: "FI", suomija: "FI",
  austria: "AT", österreich: "AT", austrija: "AT",
};

const CURRENCIES = ["EUR", "PLN", "SEK", "NOK", "DKK", "CHF", "GBP", "CZK", "HUF", "USD", "RON", "BGN"];

// Iškrovimo žodžiai tikrinami pirmi: „unloading“ ir „Entladestelle“ savyje turi
// pakrovimo žodžius.
const UNLOADING_WORDS = ["unload", "delivery", "deliver", "destination", "entlade", "entladung", "zustellung", "rozładun", "rozladun", "iškrov", "iskrov", "pristatym", "dostaw"];
const LOADING_WORDS = ["loading", "pickup", "pick-up", "pick up", "collection", "origin", "available", "belade", "ladedatum", "ladeort", "verlad", "załadun", "zaladun", "pakrov", "odbiór"];
const PRICE_WORDS = ["price", "preis", "freight", "fracht", "rate", "budget", "stawka", "cena", "kaina", "offered", "agreed"];
const WEIGHT_WORDS = ["weight", "gewicht", "waga", "svoris", "masa"];
const PALLET_WORDS = ["pallet", "palet", "palett"];
const LDM_WORDS = ["ldm", "loading meter", "lademeter", "metry ładowne", "krovimo metr"];
const ROUTE_WORDS = ["route", "trasa", "relacja", "maršrutas", "strecke"];

function hasWord(label: string, words: readonly string[]): boolean {
  return words.some((word) => label.includes(word));
}

/** „to“ ir „from“ – tik kaip atskiri žodžiai: „Total weight“ nėra „to“. */
function sideOf(label: string): "loading" | "unloading" | null {
  if (hasWord(label, UNLOADING_WORDS) || /(^|[^a-ząčęėįšųūž])to([^a-ząčęėįšųūž]|$)/.test(label)) return "unloading";
  if (hasWord(label, LOADING_WORDS) || /(^|[^a-ząčęėįšųūž])from([^a-ząčęėįšųūž]|$)/.test(label)) return "loading";
  return null;
}

/**
 * Skaičius su tūkstančių ar dešimtainiu skirtuku: „1,450“, „1.250,00“, „1 430“,
 * „12.5“, „22.000“. Vienas skirtukas su trimis skaitmenimis po jo – tūkstančiai.
 */
export function parseLooseNumber(raw: string): number | null {
  const text = raw.replace(/[\s  ]/g, "");
  if (!/^\d[\d.,]*$/.test(text)) return null;
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    normalized = text.split(thousands).join("").replace(decimal, ".");
  } else if (lastDot >= 0 || lastComma >= 0) {
    const separator = lastDot >= 0 ? "." : ",";
    const parts = text.split(separator);
    const tail = parts[parts.length - 1];
    normalized = parts.length === 2 && tail.length !== 3 ? `${parts[0]}.${tail}` : parts.join("");
  } else {
    normalized = text;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

// Tūkstančių skirtukas – tik prieš lygiai tris skaitmenis: „21 000“ yra vienas
// skaičius, o „08:00, 22 t“ – du.
const NUMBER = String.raw`(?<![\d.,])(?:\d{1,3}(?:[   .,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d+)?)`;

export interface Money {
  amount: number;
  currency: string;
}

/** Visos sumos su valiuta: „1,450 EUR“, „€980“, „EUR 1,980.00“, „1590 €“, „2 000 zł“. */
export function findMoney(text: string): Money[] {
  const currency = String.raw`€|zł|${CURRENCIES.join("|")}`;
  const pattern = new RegExp(String.raw`(?:(${currency})\s*(${NUMBER}))|(?:(${NUMBER})\s*(${currency}))`, "gi");
  const found: Money[] = [];
  for (const match of text.matchAll(pattern)) {
    const amount = parseLooseNumber(match[2] ?? match[3] ?? "");
    const code = (match[1] ?? match[4] ?? "").toUpperCase();
    if (amount === null || amount <= 0) continue;
    // „24 EUR pallets“ – paletės, ne kaina.
    if (/^\s*-?\s*pal/i.test(text.slice(match.index + match[0].length))) continue;
    found.push({ amount, currency: code === "€" ? "EUR" : code === "ZŁ" ? "PLN" : code });
  }
  return found;
}

/** Svoris kilogramais: „18,000 kg“, „12.5 t“, „14 tonnes“. */
export function findWeightsKg(text: string): number[] {
  const pattern = new RegExp(String.raw`(${NUMBER})\s*(kg|tonnes|tonnen|tonnes|tons|tonų|tony|ton|t)(?![a-ząčęėįšųūž])`, "gi");
  const found: number[] = [];
  for (const match of text.matchAll(pattern)) {
    const value = parseLooseNumber(match[1]);
    if (value === null || value <= 0) continue;
    const kg = match[2].toLowerCase() === "kg" ? value : value * 1000;
    // Daugiau nei 40 t vienas vilkikas nepaveža – tai ne krovinio svoris.
    if (kg <= 40_000) found.push(Math.round(kg));
  }
  return found;
}

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function shiftDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Mėnesių šaknys: anglų, vokiečių, lenkų, lietuvių. Pirmas tinkantis laimi. */
const MONTH_STEMS: [string, number][] = [
  ["jan", 1], ["stycz", 1], ["saus", 1],
  ["feb", 2], ["lut", 2], ["vasar", 2],
  ["mar", 3], ["mär", 3], ["kov", 3],
  ["apr", 4], ["kwie", 4], ["baland", 4],
  ["may", 5], ["mai", 5], ["maj", 5], ["geguz", 5],
  ["jun", 6], ["czerw", 6], ["birz", 6],
  ["jul", 7], ["lip", 7], ["liep", 7],
  ["aug", 8], ["sierp", 8], ["rugpj", 8],
  ["sep", 9], ["wrze", 9], ["rugs", 9],
  ["oct", 10], ["okt", 10], ["pazdz", 10], ["spal", 10],
  ["nov", 11], ["listop", 11], ["lapkr", 11],
  ["dec", 12], ["dez", 12], ["grud", 12], ["gruod", 12],
];

function monthFromName(word: string): number | null {
  const folded = fold(word);
  return MONTH_STEMS.find(([stem]) => folded.startsWith(fold(stem)))?.[1] ?? null;
}

export interface FoundDate {
  date: string;
  time: string | null;
}

/**
 * Datos tekste. Be metų („02.11.“) – artimiausi metai, kad data nebūtų seniau
 * nei prieš mėnesį: pasiūlymai būna ateičiai. Laikas – pirmas po datos.
 */
export function findDates(text: string, today: string): FoundDate[] {
  const found: { index: number; end: number; date: string }[] = [];
  const add = (index: number, end: number, date: string | null) => {
    if (date && !found.some((row) => index < row.end && row.index < end)) found.push({ index, end, date });
  };

  for (const match of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    add(match.index, match.index + match[0].length, validDate(Number(match[1]), Number(match[2]), Number(match[3])));
  }
  for (const match of text.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/g)) {
    add(match.index, match.index + match[0].length, validDate(Number(match[3]), Number(match[2]), Number(match[1])));
  }
  for (const match of text.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(?!\d)/g)) {
    const year = Number(today.slice(0, 4));
    let date = validDate(year, Number(match[2]), Number(match[1]));
    if (date && date < shiftDays(today, -31)) date = validDate(year + 1, Number(match[2]), Number(match[1]));
    add(match.index, match.index + match[0].length, date);
  }
  // „lapkričio 5 d.“, „5 November“, „5. listopada“ – žodžiu parašytas mėnuo.
  const month = String.raw`[A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūžäöüÄÖÜßłŁńŃóÓśŚźŹżŻ]{3,}`;
  // Dvi atskiros paieškos: vienoje „Loading 5“ (žodis + skaičius) suvalgytų
  // „5 November“ pradžią.
  const dayFirst = new RegExp(String.raw`\b(\d{1,2})\.?\s+(${month})(?:\s+(\d{4}))?`, "g");
  const monthFirst = new RegExp(String.raw`\b(${month})\s+(\d{1,2})(?!\d)(?:\s*d\.)?(?:,?\s+(\d{4}))?`, "g");
  const namedMatches = [
    ...[...text.matchAll(dayFirst)].map((match) => ({ match, day: match[1], name: match[2], year: match[3] })),
    ...[...text.matchAll(monthFirst)].map((match) => ({ match, day: match[2], name: match[1], year: match[3] })),
  ];
  for (const { match, day: dayText, name, year: yearText } of namedMatches) {
    const monthNumber = monthFromName(name);
    if (monthNumber === null) continue;
    const day = Number(dayText);
    const year = yearText ? Number(yearText) : Number(today.slice(0, 4));
    let date = validDate(year, monthNumber, day);
    if (date && !yearText && date < shiftDays(today, -31)) date = validDate(year + 1, monthNumber, day);
    add(match.index, match.index + match[0].length, date);
  }
  const relative: [RegExp, number][] = [
    [/\b(today|heute)\b|dziś|dzisiaj|šiandien/gi, 0],
    [/\b(tomorrow|morgen|jutro|rytoj)\b/gi, 1],
  ];
  for (const [pattern, days] of relative) {
    for (const match of text.matchAll(pattern)) add(match.index, match.index + match[0].length, shiftDays(today, days));
  }

  return found
    .sort((a, b) => a.index - b.index)
    .map((row, position, rows) => {
      const until = rows[position + 1]?.index ?? text.length;
      const time = text.slice(row.end, until).match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
      return { date: row.date, time: time ? `${time[1].padStart(2, "0")}:${time[2]}` : null };
    });
}

/** Vieta iš „LT-49400 Kaunas, Lithuania“, „Breda (NL), ZIP 4815“, „Wrocław, Poland (54-156)“. */
export function parsePlace(raw: string): OfferPlace | null {
  let rest = ` ${raw} `;
  let country: string | null = null;
  let postalCode: string | null = null;

  const coded = rest.match(new RegExp(String.raw`(?<![A-Za-z])(${COUNTRIES.join("|")})[\s-]?(\d{2}-\d{3}|\d{3}\s\d{2}|\d{4,5}|\d{3,4})(?!\d)`));
  if (coded) {
    country = coded[1];
    postalCode = coded[2];
    rest = rest.replace(coded[0], " ");
  }

  const bracketCode = rest.match(new RegExp(String.raw`\((${COUNTRIES.join("|")})\)`));
  if (bracketCode) {
    country ??= bracketCode[1];
    rest = rest.replace(bracketCode[0], " ");
  }

  const lower = rest.toLowerCase();
  for (const [name, code] of Object.entries(COUNTRY_NAMES).sort((a, b) => b[0].length - a[0].length)) {
    const at = lower.indexOf(name);
    if (at >= 0 && !/[a-ząčęėįšųūž]/i.test(lower[at - 1] ?? " ") && !/[a-ząčęėįšųūž]/i.test(lower[at + name.length] ?? " ")) {
      country ??= code;
      rest = rest.slice(0, at) + " " + rest.slice(at + name.length);
      break;
    }
  }

  if (!postalCode) {
    const loose = rest.match(/(?:zip|plz|kod|pašto kodas)?\s*\(?\b(\d{2}-\d{3}|\d{4,5})\b\)?/i);
    if (loose) {
      postalCode = loose[1];
      rest = rest.replace(loose[0], " ");
    }
  }

  const city = rest
    .replace(/\b(zip|plz)\b/gi, " ")
    .replace(/[()[\],;|]/g, " ")
    .replace(/\s+-\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!/\p{L}{2}/u.test(city) || /\d/.test(city)) return null;
  return { country, postalCode, city };
}

/** Maršruto eilutė „FR 69007 Lyon -> CZ 10200 Praha“: dvi vietos. */
function routePlaces(value: string): [OfferPlace, OfferPlace] | null {
  const parts = value.split(/\s*(?:->|=>|>>|→|–>|>)\s*/).filter((part) => part.trim() !== "");
  if (parts.length !== 2) return null;
  const from = parsePlace(parts[0]);
  const to = parsePlace(parts[1]);
  return from && to ? [from, to] : null;
}

function detectSource(text: string): OfferSource {
  if (/timocom/i.test(text)) return "timocom";
  if (/trans\.eu/i.test(text)) return "transeu";
  return "unknown";
}

function emptyFields(source: OfferSource): OfferFields {
  return {
    source, loading: null, unloading: null, extraStops: [], loadingDate: null, loadingTime: null,
    unloadingDate: null, priceCents: null, currency: null, weightKg: null, ldm: null, pallets: null,
  };
}

/** Kaina centais tik eurais – kitų valiutų skaičiuoklė neperskaičiuoja. */
function priceFromMoney(money: Money): Pick<OfferFields, "priceCents" | "currency"> {
  return { priceCents: money.currency === "EUR" ? Math.round(money.amount * 100) : null, currency: money.currency };
}

/**
 * Taisyklėmis: kiekviena eilutė „Pavadinimas: reikšmė“ arba be pavadinimo.
 * Kurią vietą ar datą eilutė pildo, sprendžia pavadinimo žodžiai, o kas tai
 * yra – pati reikšmė: „Pakrovimas: 2026-11-03“ yra data, „Załadunek: PL 93-231 Łódź“ – vieta.
 */
export function parseOffer(raw: string, today: string): ParsedOffer {
  const text = raw.slice(0, MAX_OFFER_TEXT);
  const fields = emptyFields(detectSource(text));
  const confidence: ParsedOffer["confidence"] = {};
  const unparsed: string[] = [];

  const set = <K extends OfferFieldName>(name: K, value: OfferFields[K], level: "high" | "low") => {
    if (value === null || fields[name] !== null) return false;
    fields[name] = value;
    confidence[name] = level;
    return true;
  };

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    // Pavadinimas be skaitmenų: „Loading 06.11.2026 at 09:00“ dvitaškis yra laike.
    const labelled = line.match(/^([^:\d]{1,48}):\s*(.+)$/);
    const label = (labelled ? labelled[1] : line).toLowerCase();
    const value = labelled ? labelled[2] : line;
    let used = false;

    if (hasWord(label, PRICE_WORDS)) {
      const money = findMoney(value)[0];
      if (money && fields.currency === null) {
        const price = priceFromMoney(money);
        fields.currency = price.currency;
        if (price.priceCents !== null) set("priceCents", price.priceCents, "high");
        used = true;
      }
    }
    if (hasWord(label, LDM_WORDS) || /ldm/i.test(value)) {
      const ldm = value.match(/(\d+(?:[.,]\d+)?)\s*(?:ldm|m\b)?/i);
      if (ldm) used = set("ldm", parseLooseNumber(ldm[1]), "high") || used;
    }
    if (hasWord(label, WEIGHT_WORDS)) {
      const weight = findWeightsKg(value)[0];
      if (weight !== undefined) used = set("weightKg", weight, "high") || used;
    }
    const pallets = value.match(/(\d+)\s*(?:eur[- ]?|euro[- ]?)?(?:pallets?|palet\w*|palett\w*)/i)
      ?? (hasWord(label, PALLET_WORDS) ? value.match(/^(\d+)\b/) : null);
    if (pallets) used = set("pallets", Number(pallets[1]), "high") || used;

    const route = (hasWord(label, ROUTE_WORDS) || !labelled) ? routePlaces(value) : null;
    if (route) {
      used = set("loading", route[0], "high") || used;
      used = set("unloading", route[1], "high") || used;
    }

    const side = route ? null : sideOf(label);
    if (side && !hasWord(label, LDM_WORDS)) {
      const dates = findDates(value, today);
      if (dates.length > 0) {
        if (side === "loading") {
          used = set("loadingDate", dates[0].date, "high") || used;
          used = set("loadingTime", dates[0].time, "high") || used;
        } else {
          used = set("unloadingDate", dates[0].date, "high") || used;
        }
      } else if (labelled) {
        const place = parsePlace(value);
        if (place) used = set(side === "loading" ? "loading" : "unloading", place, "high") || used;
      }
    }

    if (!used) unparsed.push(line);
  }

  // Be pavadinimų: kaina su valiuta ir svoris kilogramais bet kurioje eilutėje.
  if (fields.currency === null) {
    const money = findMoney(text)[0];
    if (money) {
      const price = priceFromMoney(money);
      fields.currency = price.currency;
      if (price.priceCents !== null) set("priceCents", price.priceCents, "low");
    }
  }
  if (fields.weightKg === null) {
    const kg = text.match(new RegExp(String.raw`(${NUMBER})\s*kg\b`, "i"));
    if (kg) set("weightKg", findWeightsKg(kg[0])[0] ?? null, "low");
  }
  if (fields.loadingDate === null || fields.unloadingDate === null) {
    const dates = findDates(text, today);
    if (fields.loadingDate === null && dates[0]) {
      set("loadingDate", dates[0].date, "low");
      set("loadingTime", dates[0].time, "low");
    }
    const later = dates.find((row) => fields.loadingDate !== null && row.date > fields.loadingDate);
    if (fields.unloadingDate === null && later) set("unloadingDate", later.date, "low");
  }

  return { fields, confidence, unparsed };
}

/** AI reikia tik tada, kai be jo nėra nuo ko skaičiuoti kainos. */
export function needsAi(offer: ParsedOffer): boolean {
  const { loading, unloading, loadingDate } = offer.fields;
  return loading === null || unloading === null || loadingDate === null;
}

/** Taisyklių rasta lieka, AI tik papildo tai, ko nerasta. */
export function mergeOffer(rules: OfferFields, ai: OfferFields): { fields: OfferFields; fromAi: OfferFieldName[] } {
  const fields: OfferFields = { ...rules, extraStops: rules.extraStops.length ? rules.extraStops : ai.extraStops };
  const fromAi: OfferFieldName[] = [];
  for (const name of Object.keys(ai) as (keyof OfferFields)[]) {
    if (name === "source" || name === "extraStops") continue;
    if (fields[name] === null && ai[name] !== null) {
      (fields as unknown as Record<string, unknown>)[name] = ai[name];
      fromAi.push(name);
    }
  }
  if (fields.source === "unknown") fields.source = ai.source;
  // Valiuta ir kaina eina kartu: AI kaina ne eurais neperrašo taisyklių valiutos.
  if (rules.currency !== null) fields.currency = rules.currency;
  return { fields, fromAi };
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function textPlace(place: unknown, text: string): OfferPlace | null {
  if (typeof place !== "object" || place === null) return null;
  const row = place as Record<string, unknown>;
  const city = typeof row.city === "string" ? row.city.trim() : "";
  // Miestas turi būti tekste – kitaip AI jį išgalvojo. Linksnis gali skirtis
  // („iš Vilniaus“ -> „Vilnius“), todėl užtenka žodžio pradžios.
  const stem = fold(city).slice(0, Math.max(3, Math.min(5, city.length - 2)));
  const words = fold(text).split(/[^\p{L}]+/u);
  if (!city || !(fold(text).includes(fold(city)) || words.some((word) => word.startsWith(stem)))) return null;
  const country = typeof row.country === "string" && COUNTRIES.includes(row.country.toUpperCase()) ? row.country.toUpperCase() : null;
  const postal = typeof row.postalCode === "string" && /^[\d -]{3,8}$/.test(row.postalCode.trim()) && text.includes(row.postalCode.trim())
    ? row.postalCode.trim()
    : null;
  return { country, postalCode: postal, city };
}

/**
 * AI atsakymas -> tie patys laukai, bet tik tai, ką galima rasti tekste:
 * data – tarp datų, kurias randa `findDates`, kaina – tarp `findMoney` sumų,
 * svoris – tarp `findWeightsKg`. Kas neatitinka, išmetama, ne pataisoma.
 */
export function validateAiOffer(raw: unknown, text: string, today: string): OfferFields {
  const fields = emptyFields(detectSource(text));
  if (typeof raw !== "object" || raw === null) return fields;
  const row = raw as Record<string, unknown>;

  const dates = findDates(text, today);
  const dateIn = (value: unknown) => (typeof value === "string" && dates.some((found) => found.date === value) ? value : null);
  const money = findMoney(text);
  const weights = findWeightsKg(text);
  const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null);

  fields.loading = textPlace(row.loading, text);
  fields.unloading = textPlace(row.unloading, text);
  fields.extraStops = Array.isArray(row.extraStops)
    ? row.extraStops.flatMap((stop): OfferStop[] => {
      if (typeof stop !== "object" || stop === null) return [];
      const item = stop as Record<string, unknown>;
      const place = textPlace(item.place, text);
      const kind = item.kind === "loading" || item.kind === "unloading" ? item.kind : null;
      return place && kind ? [{ kind, place }] : [];
    })
      // Pirmas pakrovimas ir paskutinis iškrovimas jau yra – AI juos kartais pakartoja.
      .filter((stop) => ![fields.loading, fields.unloading].some((end) => end && fold(end.city ?? "") === fold(stop.place.city ?? "")))
      .slice(0, 6)
    : [];

  fields.loadingDate = dateIn(row.loadingDate);
  fields.unloadingDate = dateIn(row.unloadingDate);
  const time = typeof row.loadingTime === "string" ? row.loadingTime.match(/^([01]\d|2[0-3]):[0-5]\d$/)?.[0] ?? null : null;
  fields.loadingTime = fields.loadingDate && time && text.includes(time.replace(/^0/, "")) ? time : null;

  const amount = number(row.price);
  const currency = typeof row.currency === "string" ? row.currency.toUpperCase() : null;
  const matched = amount !== null ? money.find((found) => Math.abs(found.amount - amount) < 0.005 && (currency === null || found.currency === currency)) : undefined;
  if (matched) Object.assign(fields, priceFromMoney(matched));

  const weight = number(row.weightKg);
  fields.weightKg = weight !== null && weights.some((found) => Math.abs(found - weight) < 1) ? Math.round(weight) : null;
  const ldm = number(row.ldm);
  const ldmInText = ldm !== null && new RegExp(String.raw`(?<!\d)${String(ldm).replace(".", "[.,]")}(?!\d)`).test(text);
  fields.ldm = ldm !== null && ldm <= 13.6 && ldmInText ? ldm : null;
  const pallets = number(row.pallets);
  fields.pallets = pallets !== null && Number.isInteger(pallets) && pallets <= 66 && new RegExp(String.raw`\b${pallets}\b`).test(text) ? pallets : null;

  if (row.source === "timocom" || row.source === "transeu") fields.source = fields.source === "unknown" ? row.source : fields.source;
  return fields;
}

/** Vieta geokodavimui: „49400 Kaunas, LT“. */
export function placeQuery(place: OfferPlace): string {
  return [[place.postalCode, place.city].filter(Boolean).join(" "), place.country].filter(Boolean).join(", ");
}

function shortDate(iso: string): string {
  return iso.slice(5);
}

/** Viena eilutė žmogui: kas užpildyta. */
export function offerSummary(fields: OfferFields, usedAi: boolean): string {
  const parts: string[] = [];
  if (fields.loading || fields.unloading) parts.push(`${fields.loading?.city ?? "?"} → ${fields.unloading?.city ?? "?"}`);
  if (fields.loadingDate) parts.push(shortDate(fields.loadingDate) + (fields.loadingTime ? ` ${fields.loadingTime}` : ""));
  // `lt-LT` tūkstančius skiria nelaužiamu tarpu; eilutėje užtenka paprasto.
  if (fields.priceCents !== null) parts.push(`${(fields.priceCents / 100).toLocaleString("lt-LT", { maximumFractionDigits: 2 }).replace(/\s/g, " ")} €`);
  if (fields.weightKg !== null) parts.push(`${String(Math.round(fields.weightKg / 100) / 10).replace(".", ",")} t`);
  if (parts.length === 0) return "";
  return `Užpildyta: ${parts.join(", ")}${usedAi ? " (AI)" : ""}.`;
}

/** Ko trūksta ir kas neaišku – kad žmogus žinotų, ką patikrinti. */
export function offerWarnings(fields: OfferFields): string[] {
  const warnings: string[] = [];
  const missing = [
    fields.loading ? null : "pakrovimo vieta",
    fields.unloading ? null : "iškrovimo vieta",
    fields.loadingDate ? null : "pakrovimo data",
    fields.currency ? null : "kaina",
  ].filter(Boolean);
  if (missing.length) warnings.push(`Nerasta: ${missing.join(", ")} – įveskite ranka.`);
  if (fields.currency && fields.currency !== "EUR") {
    warnings.push(`Kaina nurodyta ${fields.currency} – neperskaičiuota į eurus, įveskite kainą eurais.`);
  }
  if (fields.extraStops.length) warnings.push(`Pasiūlyme ${fields.extraStops.length} papildomi sustojimai – patikrinkite jų tvarką.`);
  return warnings;
}
