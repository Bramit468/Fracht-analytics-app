import { unstable_cache } from "next/cache";

/**
 * Visos Telematika.lt užklausos – vienoje vietoje ir per bendrą serverio
 * talpyklą, kad ir kiek žmonių, skirtukų ar mygtukų paspaudimų būtų.
 *
 * Tiekėjo atsakymas (2026-10): vietos atsinaujina kas 3 min., todėl dažniau
 * jų imti nėra prasmės. Paros km ir pirkimai – visas parkas už 3 mėn.;
 * rekomenduojama imti kartą per parą, o einamosios paros eilutė netiksli.
 * 6 val. – kompromisas: vakarykščiai km atsiranda tą pačią dieną.
 */
const FEEDS = {
  snapshot: { env: "TELEMATIKA_SNAPSHOT_URL", revalidate: 180 },
  canDaily: { env: "TELEMATIKA_CANDAILY_URL", revalidate: 6 * 60 * 60 },
  supplies: { env: "TELEMATIKA_SUPPLIES_URL", revalidate: 6 * 60 * 60 },
  // Užsakymai ir jų kelionės (atkarpos) – importui mygtuku. 15 min.: peržiūra
  // ir importas iš karto po jos turi matyti tą patį, o ne siųsti du kartus.
  // Kelionių tiekėjas duoda tik paskutinį mėnesį (~1 MB).
  orders: { env: "TELEMATIKA_ORDERS_URL", revalidate: 15 * 60 },
  trips: { env: "TELEMATIKA_TRIPS_URL", revalidate: 15 * 60 },
} as const;

export type TelematicsFeed = keyof typeof FEEDS;

/**
 * Supplies laukai, kuriuos skaito `parseSupplies` ir `supplyArchiveRows`.
 * Visas atsakymas – 2,4 MB (21 laukas, ~5 600 eilučių), o Vercel talpykla
 * didesnio nei 2 MB įrašo nelaiko: be šio apkarpymo pirkimai būdavo siunčiami
 * kaskart. Su šiais laukais – ~1,2 MB. Naujas laukas parseryje turi atsirasti ir čia.
 */
export const SUPPLY_FIELDS = [
  "ItemId",
  "Plates",
  "Number",
  "OperationDate",
  "TypeTitle",
  "Comment",
  "Quantity",
  "TotalPrice",
  "CurrencyShortTitle",
  "Country",
] as const;

/** Palieka tik naudojamus laukus. Ne sąrašą grąžina nepakeistą – parseris pats praneš klaidą. */
export function slimSupplies(payload: unknown): unknown {
  if (!Array.isArray(payload)) return payload;
  return payload.map((row) =>
    typeof row === "object" && row !== null
      ? Object.fromEntries(SUPPLY_FIELDS.map((field) => [field, (row as Record<string, unknown>)[field]]))
      : row,
  );
}

/** Klaida, kurią saugu rodyti žmogui: be nuorodos ir rakto. */
export class TelematicsFeedError extends Error {}

async function load(feed: TelematicsFeed): Promise<unknown> {
  const name = FEEDS[feed].env;
  // Įklijuojant į Vercel lengvai prilimpa tarpas ar kabutės.
  const url = process.env[name]?.trim().replace(/^["']|["']$/g, "");
  if (!url) throw new TelematicsFeedError(`Nenurodytas ${name}`);
  // Pranešimuose nuorodos nėra: joje prieigos raktas.
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new TelematicsFeedError(`${name}: nepavyko prisijungti (patikrinkite nuorodą)`);
  }
  if (!response.ok) throw new TelematicsFeedError(`${name}: atsakymas ${response.status}`);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new TelematicsFeedError(`${name}: atsakymas ne JSON`);
  }
  // ponytail: ~1,2 MB iš 2 MB ribos; jei parkas ar istorija stipriai išaugs, laikyti jau suskaičiuotas eilutes.
  return feed === "supplies" ? slimSupplies(payload) : payload;
}

/**
 * `unstable_cache`, o ne `fetch` talpykla: dalis kvietėjų yra server action'ai,
 * o klaida neįrašoma į talpyklą – kitas kvietimas bandys iš naujo.
 */
export function fetchTelematics(feed: TelematicsFeed): Promise<unknown> {
  return unstable_cache(load, ["telematics", feed], { revalidate: FEEDS[feed].revalidate })(feed);
}
