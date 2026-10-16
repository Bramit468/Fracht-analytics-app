import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { calcDailyRate } from "@/lib/calc";
import { formatCents } from "@/lib/money";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { liveTrucks, parseSnapshots, type LiveTruck } from "@/lib/telematics";
import { canUseTelematics } from "@/lib/telematics-access";
import { parseCanDaily, type DailyDistance } from "@/lib/telematics-costs";
import { fetchTelematics } from "@/lib/telematics-feed";
import {
  addDays,
  fuelDrift,
  isOnTheRoad,
  tripProgress,
  type FuelDrift,
  type TripProgress,
} from "@/lib/trip-progress";
import type { Trip } from "@/types/trip";
import type { Truck } from "@/types/truck";

import { Page, PageHeader } from "../../ui";
import { LiveMap } from "./live-map";

export const metadata: Metadata = {
  title: "Vyksta dabar | Bramit",
};

/** Kiek dienų atgal ieškoti reisų, kurie dar gali vykti. */
const SENIAUSIA_PRADZIA = 60;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Dabartis tiekėjo formatu ir zona: „2026-10-13 17:26:58“ Lietuvos laiku. */
function vilniusNow(date: Date): string {
  return date.toLocaleString("sv-SE", { timeZone: "Europe/Vilnius" });
}

/** Telematika yra priedas: be jos rodome planą be fakto, o ne klaidą. */
async function loadDaily(): Promise<DailyDistance[]> {
  try {
    return parseCanDaily(await fetchTelematics("canDaily"));
  } catch {
    return [];
  }
}

/** Kiek dienų tylintis objektas dar laikomas gyvu: senesni – parduoti ar išjungti. */
const VIETA_GALIOJA_DIENU = 7;

type Live =
  | { status: "off" }
  | { status: "error" }
  | { status: "ok"; trucks: LiveTruck[]; withoutPosition: string[] };

/**
 * Furų vietos dabar. Tikrinama įmonė: nuorodos yra vienos įmonės, o vietos –
 * ne reiso duomenys, kurių RLS neapsaugotų (#S2).
 */
async function loadLive(allowed: boolean, plates: string[], today: string): Promise<Live> {
  if (!allowed || !process.env.TELEMATIKA_SNAPSHOT_URL) return { status: "off" };
  try {
    const rows = parseSnapshots(
      await fetchTelematics("snapshot"),
      `${addDays(today, -VIETA_GALIOJA_DIENU)} 00:00:00`,
    );
    return { status: "ok", ...liveTrucks(rows, plates, vilniusNow(new Date())) };
  } catch {
    return { status: "error" };
  }
}

interface Row {
  trip: Trip;
  plate: string;
  progress: TripProgress;
  /** Kuro nukrypimas nuo normos. `null`, kai faktinių sąnaudų dar nėra (#137). */
  drift: FuelDrift | null;
}

export default async function VykstaPage() {
  // Priklauso nuo šiandienos, todėl puslapis generuojamas kiekvienai užklausai.
  await connection();

  const today = isoDate(new Date());
  const supabase = await createServerSupabaseClient();

  const [tripResult, truckResult, daily, allowed] = await Promise.all([
    supabase
      .from("trips")
      .select("*")
      .lte("trip_date", today)
      .gte("trip_date", addDays(today, -SENIAUSIA_PRADZIA))
      .order("trip_date"),
    supabase.from("trucks").select("id,plate").overrideTypes<Pick<Truck, "id" | "plate">[], { merge: false }>(),
    loadDaily(),
    canUseTelematics(supabase),
  ]);

  const plates = new Map((truckResult.data ?? []).map((truck) => [truck.id, truck.plate]));
  const live = await loadLive(allowed, [...plates.values()], today);

  const rows: Row[] = ((tripResult.data as Trip[] | null) ?? [])
    .filter((trip) => isOnTheRoad(trip.trip_date, trip.days, today))
    .map((trip) => {
      const plate = plates.get(trip.truck_id) ?? "";
      const plannedKm = trip.paid_km + trip.empty_km;
      const progress = tripProgress(
        daily,
        plate,
        trip.trip_date,
        trip.days,
        plannedKm,
        calcDailyRate(trip.truck_costs),
        today,
      );

      return {
        trip,
        plate,
        progress,
        drift: fuelDrift(
          progress.litresPer100Km,
          trip.fuel_l_per_100km,
          trip.fuel_price,
          progress.drivenKm,
          plannedKm,
        ),
      };
    });

  return (
    <Page>
      <PageHeader title="Vyksta dabar" description="Reisai, kurių šiandiena patenka tarp pradžios ir pabaigos." />
      <div className="mt-5 flex flex-col gap-6">

      {live.status === "error" && (
        <p role="alert" className="rounded-lg border border-warn bg-warn-soft p-3 text-sm text-ink">
          Nepavyko gauti furų vietų iš telematikos.
        </p>
      )}
      {live.status === "ok" && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Furos dabar</h2>
          {/* Žemėlapio plytelės eina per PTV raktą; be jo lieka lentelė. */}
          {process.env.PTV_API_KEY && live.trucks.length > 0 && <LiveMap trucks={live.trucks} />}
          {live.trucks.length === 0 ? (
            <p className="text-sm text-muted">Nė viena sąrašo fura per paskutines {VIETA_GALIOJA_DIENU} d. vietos nesiuntė.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr><th className="py-1 font-normal">Fura</th><th className="font-normal">Būsena</th><th className="font-normal">Šalis</th><th className="font-normal">Paskutinis signalas</th></tr>
              </thead>
              <tbody>
                {live.trucks.map((truck) => (
                  <tr key={truck.plate} className="border-t">
                    <td className="py-1 font-semibold">{truck.plate}</td>
                    <td className={truck.moving ? "text-good" : truck.state === "Nėra ryšio" ? "text-warn" : ""}>{truck.state}</td>
                    <td>{truck.country ?? "—"}</td>
                    <td className="tabular-nums">{truck.gpsTime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-muted">
            Vietos atsinaujina kas minutę. Laikas – telematikos tiekėjo, Lietuvos laiku.
            {live.withoutPosition.length > 0 && ` Be vietos: ${live.withoutPosition.join(", ")}.`}
          </p>
        </section>
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface px-6 py-10 text-center text-sm text-muted">
          Šiandien nė vienas reisas nevyksta.
        </p>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {rows.map(({ trip, plate, progress, drift }) => (
            <li key={trip.id} className="rounded-lg border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted">
                    {plate || "fura nerasta"} · {progress.dayNow} para iš {progress.daysTotal}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">{trip.trip_number}</h2>
                  <p className="text-ink">
                    {trip.origin} → {trip.destination}
                  </p>
                </div>
                <Link href={`/trips/${trip.id}/edit`} className="text-sm underline">
                  Atidaryti
                </Link>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-muted">Nuvažiuota</dt>
                  <dd className="font-semibold tabular-nums">
                    {Math.round(progress.drivenKm).toLocaleString("lt-LT")} km
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Liko</dt>
                  <dd className="font-semibold tabular-nums">
                    {Math.round(progress.remainingKm).toLocaleString("lt-LT")} km
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Sąnaudos</dt>
                  <dd className="font-semibold tabular-nums">
                    {progress.litresPer100Km === null
                      ? "—"
                      : `${progress.litresPer100Km.toFixed(1)} l/100`}
                    <span className="ml-1 text-xs font-normal text-muted">
                      (plan. {trip.fuel_l_per_100km})
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Furos kaštai</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatCents(progress.truckCostSoFarCents)}
                  </dd>
                </div>
              </dl>

              {/* Pelnas dar nesuskaičiuotas, bet kuro nukrypimas jau žinomas —
                  ir apie jį verta žinoti dabar, o ne apskaitant po savaitės. */}
              {drift && drift.litresPer100KmDiff !== 0 && (
                <p
                  className={`mt-3 rounded-lg p-3 text-sm ${
                    drift.projectedCents > 0
                      ? "bg-warn-soft text-warn"
                      : "bg-accent-soft text-good"
                  }`}
                >
                  Kuras {drift.litresPer100KmDiff > 0 ? "viršija normą" : "mažesnis už normą"}{" "}
                  {Math.abs(drift.litresPer100KmDiff).toFixed(1)} l/100 km: iki šiol{" "}
                  <strong>{formatCents(Math.abs(drift.soFarCents))}</strong>, o visam reisui —{" "}
                  <strong>{formatCents(Math.abs(drift.projectedCents))}</strong>
                  {drift.projectedCents > 0 ? " brangiau" : " pigiau"}, jei sąnaudos nesikeis.
                </p>
              )}

              <p className="mt-3 text-xs text-muted">
                {progress.measuredThrough
                  ? `Kilometrai ir kuras – iki ${progress.measuredThrough} imtinai. Šiandienos eilutė telematikoje atsiranda rytoj.`
                  : "Telematikos duomenų apie šį reisą dar nėra."}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted">
        Furos kaštai skaičiuojami už prasidėjusias paras – fura kainuoja nuo išvažiavimo, o ne
        nuo tada, kai atsiranda matavimas. Kuro ir kelių išlaidos čia neįtrauktos: jos matomos
        reiso skaičiavime, o pirkimai telematikoje atsiranda su vėlavimu.
      </p>
      </div>
    </Page>
  );
}
