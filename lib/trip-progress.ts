/**
 * Vykstančio reiso eiga (#95).
 *
 * Reisą matyti galima tik sąraše, be skirtumo tarp „planuojamas", „važiuoja" ir
 * „baigtas". Bet vežėjui svarbiausia akimirka yra ta, kai dar galima ką nors
 * pakeisti — baigtą reisą telieka apskaityti.
 *
 * Naujų laukų nereikia: „vyksta" yra tada, kai šiandiena patenka tarp
 * `trip_date` ir `trip_date + days - 1`, o faktas ateina iš `CANDaily`.
 */

import type { DailyDistance } from "./telematics-costs";

export interface TripProgress {
  /** Kelinta reiso para šiandien, nuo 1 iki `daysTotal`. */
  dayNow: number;
  daysTotal: number;
  plannedKm: number;
  /** Nuvažiuota pagal telematiką. Šiandienos dar nėra – eilutė atsiras rytoj. */
  drivenKm: number;
  /** Kiek liko iš planuotų. Nulis, kai jau nuvažiuota daugiau. */
  remainingKm: number;
  /** Faktinės sąnaudos l/100 km. `null`, kai dar nevažiuota arba nėra daviklio. */
  litresPer100Km: number | null;
  /** Iki kurios dienos imtinai turime matavimus. */
  measuredThrough: string | null;
  /** Dienų, už kurias jau skaičiuojami furos kaštai. */
  daysElapsed: number;
  truckCostSoFarCents: number;
}

/** Diena ISO formatu, pridėjus parų skaičių. */
export function addDays(date: string, days: number): string {
  const start = Date.parse(date);
  if (!Number.isFinite(start)) return date;
  return new Date(start + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Ar reisas vyksta nurodytą dieną.
 *
 * Ribos imtinės: vienos paros reisas vyksta tą pačią dieną, kurią prasideda.
 */
export function isOnTheRoad(tripDate: string, days: number, today: string): boolean {
  if (!(days > 0)) return false;
  return tripDate <= today && today <= addDays(tripDate, days - 1);
}

/**
 * Sudeda to vilkiko `CANDaily` eilutes per reiso dienas iki šiandienos.
 *
 * Furos kaštai skaičiuojami už **prasidėjusias paras**, o ne už tas, kurioms
 * jau yra matavimai: fura kainuoja nuo tos akimirkos, kai išvažiavo, o ne nuo
 * tada, kai tiekėjas atsiuntė eilutę.
 */
export function tripProgress(
  daily: DailyDistance[],
  plate: string,
  tripDate: string,
  days: number,
  plannedKm: number,
  truckDailyCents: number,
  today: string,
): TripProgress {
  const lastDay = addDays(tripDate, days - 1);
  const through = today < lastDay ? today : lastDay;

  const mine = daily.filter(
    (row) => row.plate === plate && row.date >= tripDate && row.date <= through,
  );

  const drivenKm = mine.reduce((total, row) => total + row.km, 0);
  const fuelL = mine.reduce((total, row) => total + (row.fuelL ?? 0), 0);

  const dayNow = Math.min(
    days,
    Math.max(1, Math.round((Date.parse(through) - Date.parse(tripDate)) / 86_400_000) + 1),
  );

  return {
    dayNow,
    daysTotal: days,
    plannedKm,
    drivenKm: Math.round(drivenKm * 100) / 100,
    remainingKm: Math.max(0, Math.round((plannedKm - drivenKm) * 100) / 100),
    litresPer100Km: drivenKm > 0 && fuelL > 0 ? Math.round((fuelL / drivenKm) * 10000) / 100 : null,
    measuredThrough: mine.length > 0 ? mine[mine.length - 1].date : null,
    daysElapsed: dayNow,
    truckCostSoFarCents: truckDailyCents * dayNow,
  };
}

export interface FuelDrift {
  /** Skirtumas nuo normos jau nuvažiuotuose kilometruose. */
  soFarCents: number;
  /** Koks bus skirtumas visame reise, jei sąnaudos nesikeis. */
  projectedCents: number;
  /** Faktas minus norma, l/100 km. */
  litresPer100KmDiff: number;
}

/**
 * Kiek kuro viršija normą (#137).
 *
 * Vykstančio reiso pelnas dar nesuskaičiuotas, bet vienas dalykas jau žinomas:
 * faktinės kuro sąnaudos. Jei fura degina 31 l/100 vietoj 27, tai kelių šimtų
 * eurų skirtumas, ir apie jį verta žinoti dabar, o ne apskaitant reisą po
 * dviejų savaičių.
 *
 * Teigiamas skaičius reiškia brangiau, nei planuota. `null`, kai faktinių
 * sąnaudų dar nėra — spėti jų negalima.
 */
export function fuelDrift(
  actualLitresPer100Km: number | null,
  plannedLitresPer100Km: number,
  fuelPriceEur: number,
  drivenKm: number,
  plannedKm: number,
): FuelDrift | null {
  if (actualLitresPer100Km === null || !(plannedLitresPer100Km > 0) || !(fuelPriceEur > 0)) {
    return null;
  }

  const diff = actualLitresPer100Km - plannedLitresPer100Km;
  const cents = (km: number) => Math.round((km * diff * fuelPriceEur) / 100 * 100);

  return {
    soFarCents: cents(Math.max(0, drivenKm)),
    // Prognozė skaičiuojama visam planuotam atstumui: jei nuvažiuota daugiau,
    // nei planuota, imami tikri kilometrai – jų jau nebeatsuksi.
    projectedCents: cents(Math.max(plannedKm, drivenKm)),
    litresPer100KmDiff: Math.round(diff * 100) / 100,
  };
}
