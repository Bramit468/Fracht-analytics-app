/**
 * Seni importuoti reisai, kurių Telematikos atkarpų nebeturime nei sraute, nei
 * archyve (iki 2026-09-27): jiems tikslus perskaičiavimas neįmanomas, todėl
 * pagal paros ridą atimami tik šeštadieniai ir sekmadieniai, kai fura stovėjo
 * (vartotojo sprendimas, 2026-11-25). Tušti km, kuras ir keliai nekeičiami.
 */

import { addDays } from "./trip-progress";

/** Mažiau – fura tą dieną stovėjo (kaip importe). */
const STANDING_DAY_KM = 50;

export interface OldTripFix {
  /** Išmestos dienos. */
  dates: string[];
  days: number;
}

/**
 * Reiso laikotarpis – nuo datos `ceil(paros)` kalendorinių dienų, kaip `tripSpan`.
 * `null` – nėra ką keisti arba stovėjo visas laikotarpis (keisti nesaugu:
 * ponytail – tokie reisai paliekami žmogui, jų būna vienetai).
 */
export function oldTripFix(tripDate: string, days: number, kmOf: (date: string) => number | undefined): OldTripFix | null {
  const span = Math.max(1, Math.ceil(days));
  const dates: string[] = [];
  for (let i = 0; i < span; i++) {
    const date = addDays(tripDate, i);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const km = kmOf(date);
    if ((weekday === 0 || weekday === 6) && km !== undefined && km < STANDING_DAY_KM) dates.push(date);
  }
  if (dates.length === 0 || dates.length >= span) return null;
  const fixed = Math.round((days - dates.length) * 1000) / 1000;
  return fixed > 0 ? { dates, days: fixed } : null;
}
