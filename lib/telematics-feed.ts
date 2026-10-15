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

async function load(feed: TelematicsFeed): Promise<unknown> {
  const url = process.env[FEEDS[feed].env];
  if (!url) throw new Error(`Nenurodytas ${FEEDS[feed].env}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(String(response.status));
  const payload: unknown = await response.json();
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
