/**
 * Tušti km iki pakrovimo – nuo ten, kur fura iš tikrųjų bus.
 *
 * Istorinė tuščios ridos dalis yra vidurkis: Örebro–Oslo krovinys gavo 0 km,
 * nors fura atvažiavo 98 km tuščia. O tušti km dažnai ir nusprendžia, ar
 * krovinys apsimoka, todėl kelias iki pakrovimo skaičiuojamas iš tikros vietos:
 *
 * - fura dar vykdo (ar vykdys) kitą reisą – nuo to reiso iškrovimo;
 * - kitaip – nuo jos GPS vietos dabar, bet tik šiandienos ar rytojaus kroviniui;
 * - vėlesniam be žinomo reiso – lieka istorija.
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
  | { source: "gps"; latitude: number; longitude: number; gpsTime: string };

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

  // GPS – tik šiandienos ir rytojaus kroviniui: iki vėlesnio fura spės
  // nuvažiuoti kitur, o dabartinė vieta skaičiuotų nesąmones (draugo pastaba).
  if (!gps || quoteDate > addDays(today, GPS_VALID_DAYS)) return null;
  return { source: "gps", ...gps };
}

/** Kiek dienų į priekį dabartinė GPS vieta dar tinka tuštiems km. */
export const GPS_VALID_DAYS = 1;

/** Žmogui: iš kur paimti tušti km. */
export function emptyRunNote(start: EmptyRunStart, km: number, hours: number, applied: boolean): string {
  const verb = applied ? "įrašyta" : "siūloma";
  const kmText = String(Math.round(km * 100) / 100).replace(".", ",");
  const hoursText = String(Math.round(hours * 10) / 10).replace(".", ",");
  const from = start.source === "trip"
    ? `nuo reiso ${start.tripNumber} iškrovimo (${start.address})`
    : `nuo furos GPS vietos (${start.gpsTime})`;
  return `Tušti km: ${verb} ${kmText} – PTV kelias ${from} iki pakrovimo. Į paras pridėta ${hoursText} val. važiavimo.`;
}
