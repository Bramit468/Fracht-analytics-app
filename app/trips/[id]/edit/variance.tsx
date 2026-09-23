import { formatCents } from "@/lib/money";
import { fetchEcbRates, toEuroCents } from "@/lib/ecb-rates";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { calculateSavedTrip } from "@/lib/trip-input";
import { compareTripToActuals, type TripVariance } from "@/lib/trip-variance";
import { parseCanDaily, parseSupplies, summarizeActuals } from "@/lib/telematics-costs";
import type { CountryTariff } from "@/lib/calc";
import type { Trip, TripCountryLeg } from "@/types/trip";
import type { Truck } from "@/types/truck";

const ETIKETES: Record<string, string> = {
  fuel: "Kuras",
  adblue: "AdBlue",
  road: "Keliai",
};

/** Paskutinė reiso diena: pirma diena plius trukmė be vienos. */
function lastDay(tripDate: string, days: number): string {
  const start = Date.parse(tripDate);
  if (!Number.isFinite(start)) return tripDate;
  return new Date(start + Math.max(0, days - 1) * 86_400_000).toISOString().slice(0, 10);
}

async function fetchJson(url: string | undefined): Promise<unknown> {
  if (!url) throw new Error("Nenurodytas adresas");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

/**
 * Surenka abi puses: reiso skaičiavimą ir to paties vilkiko faktą.
 *
 * Grąžina `null`, kai palyginti nėra su kuo — telematikos duomenų nėra arba
 * fura tomis dienomis nevažiavo. Tada geriau nerodyti nieko, nei rodyti nulius.
 */
async function loadVariance(tripId: string): Promise<TripVariance | null> {
  try {
    const supabase = await createServerSupabaseClient();

    const [tripResult, legsResult, tariffResult] = await Promise.all([
      supabase.from("trips").select("*").eq("id", tripId).limit(1),
      supabase.from("trip_country_legs").select("*").eq("trip_id", tripId),
      supabase.from("country_tariffs").select("country,rate,rate_type"),
    ]);

    const trip = (tripResult.data as Trip[] | null)?.[0];
    if (!trip) return null;

    const truckResult = await supabase
      .from("trucks")
      .select("plate")
      .eq("id", trip.truck_id)
      .limit(1);
    const plate = (truckResult.data as Pick<Truck, "plate">[] | null)?.[0]?.plate;
    if (!plate) return null;

    const tariffs: CountryTariff[] = (tariffResult.data ?? []).map((row) => ({
      country: row.country as string,
      rate: Number(row.rate),
      rateType: row.rate_type as CountryTariff["rateType"],
    }));

    const planned = calculateSavedTrip(
      trip,
      (legsResult.data ?? []) as TripCountryLeg[],
      trip.truck_costs,
      tariffs,
    );

    const [canRaw, suppliesRaw, rates] = await Promise.all([
      fetchJson(process.env.TELEMATIKA_CANDAILY_URL),
      fetchJson(process.env.TELEMATIKA_SUPPLIES_URL),
      fetchEcbRates(),
    ]);

    const { supplies } = parseSupplies(suppliesRaw, (amount, currency, date) =>
      toEuroCents(rates, amount, currency, date),
    );
    const actual = summarizeActuals(
      parseCanDaily(canRaw),
      supplies,
      plate,
      trip.trip_date,
      lastDay(trip.trip_date, trip.days),
    );

    if (actual.km <= 0 && actual.totalCents === 0) return null;

    return compareTripToActuals(trip, planned, actual);
  } catch {
    return null;
  }
}

function Ratio({
  label,
  planned,
  actual,
  diff,
  unit,
  places,
}: {
  label: string;
  planned: number;
  actual: number | null;
  diff: number | null;
  unit: string;
  places: number;
}) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold tabular-nums">
        {planned.toFixed(places)} → {actual === null ? "—" : actual.toFixed(places)} {unit}
        {diff !== null && diff !== 0 && (
          <span className={diff > 0 ? "ml-2 text-red-700" : "ml-2 text-green-700"}>
            {diff > 0 ? "+" : ""}
            {diff.toFixed(places)}
          </span>
        )}
      </dd>
    </div>
  );
}

/** Planas prieš faktą išsaugotam reisui (#59). */
export async function TripVarianceSection({ tripId }: { tripId: string }) {
  const variance = await loadVariance(tripId);
  if (!variance) return null;

  const brangiau = variance.profitImpactCents > 0;

  return (
    <section className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Planas prieš faktą</h2>
      <p className="mt-1 text-sm text-slate-600">
        Kairėje – kiek reisas turėjo kainuoti pagal suvestas normas, dešinėje – kiek
        ta fura realiai išleido tomis dienomis.
      </p>

      <table className="mt-4 w-full text-left text-sm">
        <thead className="border-b">
          <tr>
            <th className="py-2 font-medium">Kaštai</th>
            <th className="py-2 text-right font-medium">Planas</th>
            <th className="py-2 text-right font-medium">Faktas</th>
            <th className="py-2 text-right font-medium">Skirtumas</th>
          </tr>
        </thead>
        <tbody>
          {variance.lines.map((line) => (
            <tr key={line.key} className="border-b last:border-0">
              <td className="py-2">{ETIKETES[line.key]}</td>
              <td className="py-2 text-right tabular-nums">{formatCents(line.plannedCents)}</td>
              <td className="py-2 text-right tabular-nums">{formatCents(line.actualCents)}</td>
              <td
                className={`py-2 text-right font-semibold tabular-nums ${
                  line.diffCents > 0 ? "text-red-700" : line.diffCents < 0 ? "text-green-700" : ""
                }`}
              >
                {line.diffCents > 0 ? "+" : ""}
                {formatCents(line.diffCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className={`mt-4 text-lg font-semibold ${brangiau ? "text-red-700" : "text-green-700"}`}>
        Reisas uždirbo {formatCents(Math.abs(variance.profitImpactCents))}{" "}
        {brangiau ? "mažiau" : "daugiau"}, nei rodo skaičiavimas
        {" "}({formatCents(variance.plannedProfitCents)} → {formatCents(variance.actualProfitCents)}).
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm sm:grid-cols-3">
        <Ratio
          label="Sąnaudos"
          planned={variance.litresPer100Km.planned}
          actual={variance.litresPer100Km.actual}
          diff={variance.litresPer100Km.diff}
          unit="l/100"
          places={1}
        />
        <Ratio
          label="Kuro kaina"
          planned={variance.fuelPricePerL.planned}
          actual={variance.fuelPricePerL.actual}
          diff={variance.fuelPricePerL.diff}
          unit="€/l"
          places={3}
        />
        <Ratio
          label="Rida"
          planned={variance.km.planned}
          actual={variance.km.actual}
          diff={variance.km.diff}
          unit="km"
          places={0}
        />
      </dl>

      <p className="mt-4 border-t pt-4 text-xs text-slate-500">
        Furos paros kaštai čia nelyginami: telematika jų neturi, tai skaičiavimo
        prielaida, ne matavimas. Todėl pelno skirtumą lemia tik kuras, AdBlue ir keliai.
        {" "}
        <strong>Faktas imamas visai furai per reiso dienas.</strong> Jei tomis dienomis
        fura vežė daugiau nei vieną reisą, tie patys kaštai priskiriami kiekvienam iš jų
        ir skaičius bus per didelis.
      </p>
    </section>
  );
}
