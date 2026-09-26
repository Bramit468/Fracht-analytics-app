import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { calcDailyRate } from "@/lib/calc";
import { formatCents } from "@/lib/money";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { parseCanDaily, type DailyDistance } from "@/lib/telematics-costs";
import { addDays, isOnTheRoad, tripProgress, type TripProgress } from "@/lib/trip-progress";
import type { Trip } from "@/types/trip";
import type { Truck } from "@/types/truck";

import { AppNav } from "../../app-nav";

export const metadata: Metadata = {
  title: "Vyksta dabar | Fracht Analytics",
};

/** Kiek dienų atgal ieškoti reisų, kurie dar gali vykti. */
const SENIAUSIA_PRADZIA = 60;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function fetchJson(url: string | undefined): Promise<unknown> {
  if (!url) throw new Error("Nenurodytas adresas");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

/** Telematika yra priedas: be jos rodome planą be fakto, o ne klaidą. */
async function loadDaily(): Promise<DailyDistance[]> {
  try {
    return parseCanDaily(await fetchJson(process.env.TELEMATIKA_CANDAILY_URL));
  } catch {
    return [];
  }
}

interface Row {
  trip: Trip;
  plate: string;
  progress: TripProgress;
}

export default async function VykstaPage() {
  // Priklauso nuo šiandienos, todėl puslapis generuojamas kiekvienai užklausai.
  await connection();

  const today = isoDate(new Date());
  const supabase = await createServerSupabaseClient();

  const [tripResult, truckResult, daily] = await Promise.all([
    supabase
      .from("trips")
      .select("*")
      .lte("trip_date", today)
      .gte("trip_date", addDays(today, -SENIAUSIA_PRADZIA))
      .order("trip_date"),
    supabase.from("trucks").select("id,plate").overrideTypes<Pick<Truck, "id" | "plate">[], { merge: false }>(),
    loadDaily(),
  ]);

  const plates = new Map((truckResult.data ?? []).map((truck) => [truck.id, truck.plate]));

  const rows: Row[] = ((tripResult.data as Trip[] | null) ?? [])
    .filter((trip) => isOnTheRoad(trip.trip_date, trip.days, today))
    .map((trip) => {
      const plate = plates.get(trip.truck_id) ?? "";
      return {
        trip,
        plate,
        progress: tripProgress(
          daily,
          plate,
          trip.trip_date,
          trip.days,
          trip.paid_km + trip.empty_km,
          calcDailyRate(trip.truck_costs),
          today,
        ),
      };
    });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <AppNav />
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Vyksta dabar</h1>
        <p className="text-sm text-neutral-500">
          Reisai, kurių šiandiena patenka tarp pradžios ir pabaigos. Žymėti nieko nereikia –
          tai matyti iš datos ir trukmės.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-neutral-500">
          Šiandien nė vienas reisas nevyksta.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map(({ trip, plate, progress }) => (
            <li key={trip.id} className="rounded-2xl border p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-neutral-500">
                    {plate || "fura nerasta"} · {progress.dayNow} para iš {progress.daysTotal}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">{trip.trip_number}</h2>
                  <p className="text-neutral-700">
                    {trip.origin} → {trip.destination}
                  </p>
                </div>
                <Link href={`/trips/${trip.id}/edit`} className="text-sm underline">
                  Atidaryti
                </Link>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-neutral-500">Nuvažiuota</dt>
                  <dd className="font-semibold tabular-nums">
                    {Math.round(progress.drivenKm).toLocaleString("lt-LT")} km
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Liko</dt>
                  <dd className="font-semibold tabular-nums">
                    {Math.round(progress.remainingKm).toLocaleString("lt-LT")} km
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Sąnaudos</dt>
                  <dd className="font-semibold tabular-nums">
                    {progress.litresPer100Km === null
                      ? "—"
                      : `${progress.litresPer100Km.toFixed(1)} l/100`}
                    <span className="ml-1 text-xs font-normal text-neutral-500">
                      (plan. {trip.fuel_l_per_100km})
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Furos kaštai</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatCents(progress.truckCostSoFarCents)}
                  </dd>
                </div>
              </dl>

              <p className="mt-3 text-xs text-neutral-500">
                {progress.measuredThrough
                  ? `Kilometrai ir kuras – iki ${progress.measuredThrough} imtinai. Šiandienos eilutė telematikoje atsiranda rytoj.`
                  : "Telematikos duomenų apie šį reisą dar nėra."}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-neutral-500">
        Furos kaštai skaičiuojami už prasidėjusias paras – fura kainuoja nuo išvažiavimo, o ne
        nuo tada, kai atsiranda matavimas. Kuro ir kelių išlaidos čia neįtrauktos: jos matomos
        reiso skaičiavime, o pirkimai telematikoje atsiranda su vėlavimu.
      </p>
    </main>
  );
}
