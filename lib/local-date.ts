/**
 * Šiandiena Lietuvoje (#164).
 *
 * `new Date().toISOString().slice(0, 10)` duoda datą **UTC** laiku. Lietuvoje
 * tai UTC+2 arba UTC+3, todėl nuo vidurnakčio iki 2–3 val. ryto programa
 * manytų, kad dar vakar – o Vercel serveriai visada dirba UTC. Dokumento, kuris
 * baigiasi šiandien, tada nebūtų galima pavadinti pasibaigusiu laiku.
 *
 * `sv-SE` lokalė pasirinkta tik dėl formato: ji rašo datą kaip `2026-10-01`.
 */
const VILNIUS_DATE = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Vilnius",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayInVilnius(now: Date = new Date()): string {
  return VILNIUS_DATE.format(now);
}
