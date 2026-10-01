/**
 * Reiso trukmės prielaidos vienoje vietoje – keiskite čia, ne skaičiavime.
 *
 * Tai apytikslis ES 561/2006 modelis planavimui, o ne tachografo ataskaita:
 * tikslų atvykimą su pertraukomis pateikia PTV vairavimo laiko planas (#87).
 */

export type WeeklyRest = "reduced" | "regular";

export interface SpeedProfile {
  speedKmh: number;
  /** Kiek km per vieną vairavimo parą. */
  maxDayKm: number;
}

export const TRIP_DURATION = {
  /** Geriausias atvejis: 70 km/h ir 560 km/para (≈ 8 val. vairavimo). */
  best: { speedKmh: 70, maxDayKm: 560 } satisfies SpeedProfile,
  /** Realistiškas apatinis rėžis: eismas, degalinės, pakrovimas. */
  realistic: { speedKmh: 60, maxDayKm: 450 } satisfies SpeedProfile,

  dailyRestHours: 11,

  /**
   * Savaitinis poilsis. Įprastas ES poilsis yra 45 val. (ne 47); sutrumpintas –
   * 24 val., bet jį reikia kompensuoti, ir dviejų iš eilės negalima.
   */
  weeklyRestHours: { reduced: 24, regular: 45 } satisfies Record<WeeklyRest, number>,
  defaultWeeklyRest: "regular" satisfies WeeklyRest,

  /** Savaitinis poilsis privalomas po ne daugiau kaip 6 vairavimo parų iš eilės. */
  maxDrivingDaysPerWeek: 6,

  /** Po 4,5 val. vairavimo – bent 45 min. pertrauka. */
  breakAfterDrivingHours: 4.5,
  breakMinutes: 45,

  /** Su išvykimo data savaitinis poilsis pritaikomas savaitgaliui (šeštadienis–sekmadienis). */
  restOnWeekend: true,
} as const;
