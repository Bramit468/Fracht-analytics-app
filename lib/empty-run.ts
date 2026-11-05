/**
 * Tušti km iki pakrovimo – nuo ten, kur fura iš tikrųjų bus.
 *
 * Istorinė tuščios ridos dalis yra vidurkis: Örebro–Oslo krovinys gavo 0 km,
 * nors fura atvažiavo 98 km tuščia. O tušti km dažnai ir nusprendžia, ar
 * krovinys apsimoka, todėl kelias iki pakrovimo skaičiuojamas iš tikros vietos:
 *
 * - dispečeris įrašė, kur fura tuo metu bus – nuo ten;
 * - fura dar vykdo (ar vykdys) kitą reisą – nuo to reiso iškrovimo;
 * - Telematikoje yra jos nebaigtas užsakymas – nuo jo iškrovimo (plano 3 p.);
 * - kitaip – nuo jos GPS vietos dabar (bet kuriai datai: forma primena, kad
 *   vietai keičiantis reikia įrašyti, kur fura bus, arba skaičiuoti prieš reisą);
 * - be GPS – lieka istorija.
 */

import { stopsFromStored } from "./stops";
import { addDays } from "./trip-progress";

/** Tos pačios furos reisas, į kurį gali būti įsiterpiama. */
export interface TruckTrip {
  tripNumber: string;
  tripDate: string;
  days: number;
  destination: string;
  stops: unknown;
}

export interface TruckGps {
  latitude: number;
  longitude: number;
  /** Tiekėjo laikas „2026-10-31 09:12:00“, Lietuvos. */
  gpsTime: string;
}

export type EmptyRunStart =
  | { source: "trip"; tripNumber: string; address: string; /** „55.7,24.3“ arba tuščia. */ point: string }
  | { source: "gps"; latitude: number; longitude: number; gpsTime: string }
  | { source: "manual"; address: string; point: string }
  /** Telematikos nebaigto užsakymo iškrovimas; `end` – „2026-11-04 04:00:00“, Lietuvos laikas. */
  | { source: "order"; address: string; point: string; city: string; end: string };

/** Telematikos užsakymo atkarpa (iš `parseOrderLegs`) – tik tai, ko reikia čia. */
export interface PlannedLeg {
  plate: string | null;
  end: string;
  endPlace: string;
  endType: string | null;
  external: boolean;
}

/**
 * Kur fura bus prieš krovinį pagal Telematikos užsakymus: vėliausias jos dar
 * nepasibaigęs iškrovimas, ne vėlesnis už krovinio dieną. 2026-11-01 tokį
 * turėjo 13 furų iš 22 (1–3 dienos į priekį). Po krovinio datos besibaigiantis
 * užsakymas netinka – tada fura dar nelaisva, o kur ji bus, nežinoma.
 */
export function plannedUnloading(
  legs: PlannedLeg[],
  plateKeyOf: (plate: string) => string,
  plate: string,
  now: string,
  quoteDate: string,
): PlannedLeg | null {
  const key = plateKeyOf(plate);
  let best: PlannedLeg | null = null;
  for (const leg of legs) {
    if (leg.external || !leg.plate || plateKeyOf(leg.plate) !== key) continue;
    if ((leg.endType ?? "").toLowerCase() !== "unloading" || !leg.endPlace.trim()) continue;
    if (leg.end < now || leg.end.slice(0, 10) > quoteDate) continue;
    if (!best || leg.end > best.end) best = leg;
  }
  return best;
}

/** Paskutinė reiso diena imtinai, kaip `isOnTheRoad`: prasidėjusi para yra kelyje. */
function lastDay(trip: TruckTrip): string {
  return addDays(trip.tripDate, Math.max(1, Math.ceil(trip.days)) - 1);
}

/**
 * Iš kur fura važiuos į pakrovimą.
 *
 * Imamas vėliausiai besibaigiantis furos reisas, prasidėjęs ne vėliau už
 * krovinio datą. Jei jis dar nesibaigė (`today` ar vėliau), fura bus jo
 * iškrovime – dabartinė jos vieta tada nieko nesako. Jei baigėsi, GPS yra
 * tiksliausia žinia: po iškrovimo fura galėjo jau pajudėti.
 *
 * `null`, kai nėra nei nesibaigusio reiso, nei GPS – tada lieka istorija.
 */
export function emptyRunStart(
  trips: TruckTrip[],
  quoteDate: string,
  today: string,
  gps: TruckGps | null,
): EmptyRunStart | null {
  const before = trips
    .filter((trip) => trip.tripDate <= quoteDate && trip.days > 0)
    .sort((a, b) => lastDay(b).localeCompare(lastDay(a)) || b.tripDate.localeCompare(a.tripDate));
  const previous = before[0];

  if (previous && lastDay(previous) >= today) {
    const stops = stopsFromStored(previous.stops, "", previous.destination);
    const unloading = stops[stops.length - 1];
    const address = unloading.address.trim() || previous.destination.trim();
    if (address || unloading.point) {
      return { source: "trip", tripNumber: previous.tripNumber, address, point: unloading.point };
    }
  }

  // GPS – bet kuriai datai. Vėlesniam kroviniui vieta gali pasikeisti, todėl
  // forma tai pasako ir leidžia įrašyti, kur fura tuo metu bus.
  if (!gps) return null;
  return { source: "gps", ...gps };
}

/** Viena eilutė pagrindinėje skiltyje: kiek ir nuo kur. */
export function emptyRunShort(start: EmptyRunStart, km: number): string {
  const kmText = Math.round(km).toLocaleString("lt-LT").replace(/\s/g, " ");
  const from = start.source === "trip"
    ? `nuo reiso ${start.tripNumber} iškrovimo (${start.address})`
    : start.source === "manual"
      ? `nuo ${start.address}`
      : start.source === "order"
        ? `nuo užsakymo iškrovimo ${start.city} (${start.end.slice(5, 16)}, Telematika)`
        : `nuo furos vietos dabar (Telematika, ${start.gpsTime.slice(0, 16)})`;
  return `Tušti km iki pakrovimo: ${kmText} km ${from}.`;
}

/** Žmogui: iš kur paimti tušti km. */
export function emptyRunNote(start: EmptyRunStart, km: number, hours: number, applied: boolean): string {
  const verb = applied ? "įrašyta" : "siūloma";
  const kmText = String(Math.round(km * 100) / 100).replace(".", ",");
  const hoursText = String(Math.round(hours * 10) / 10).replace(".", ",");
  const from = start.source === "trip"
    ? `nuo reiso ${start.tripNumber} iškrovimo (${start.address})`
    : start.source === "manual"
      ? `nuo įrašytos furos vietos (${start.address})`
      : start.source === "order"
        ? `nuo Telematikos užsakymo iškrovimo (${start.city}, ${start.end.slice(0, 16)})`
        : `nuo furos GPS vietos (${start.gpsTime})`;
  return `Tušti km: ${verb} ${kmText} – PTV kelias ${from} iki pakrovimo. Į paras pridėta ${hoursText} val. važiavimo.`;
}
