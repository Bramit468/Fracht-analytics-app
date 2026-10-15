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

async function load(feed: TelematicsFeed): Promise<unknown> {
  const url = process.env[FEEDS[feed].env];
  if (!url) throw new Error(`Nenurodytas ${FEEDS[feed].env}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

/**
 * `unstable_cache`, o ne `fetch` talpykla: dalis kvietėjų yra server action'ai,
 * o klaida neįrašoma į talpyklą – kitas kvietimas bandys iš naujo.
 */
export function fetchTelematics(feed: TelematicsFeed): Promise<unknown> {
  return unstable_cache(load, ["telematics", feed], { revalidate: FEEDS[feed].revalidate })(feed);
}
