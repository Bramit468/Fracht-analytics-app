import { tripRoadsByCountry, type CountryRoad } from "./country-roads";
import { tripCostBreakdown, type CostBreakdown } from "./cost-structure";
import { emptyFuelCents } from "./empty-km";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";
import { calculateSavedTrip } from "./trip-input";
import type { CountryTariff } from "./calc";
import type { TripCountryLegInsert, TripInsert, TripWithLegs } from "../types/trip";
import type { Trip, TripCountryLeg } from "../types/trip";
import type { Truck } from "../types/truck";

export interface TripSummary {
  id: string;
  tripNumber: string;
  origin: string;
  destination: string;
  tripDate: string;
  truckPlate: string;
  /** Iš kurio Telematikos užsakymo importuotas. `null` arba nėra – ne importuotas. */
  telematikaOrderId?: string | null;
  /** Užsakovas (#183). `null` arba nėra – reisas be užsakovo. */
  customerId?: string | null;
  /**
   * Sąskaitos ir apmokėjimo datos (#185). `undefined` – migracija 0015 dar
   * nepaleista (stulpelio nėra), `null` – data neįrašyta.
   */
  invoicedOn?: string | null;
  paidOn?: string | null;
  paidKm: number;
  /** Kiek parų fura užimta – pelnui per parą (#179). */
  days: number;
  /** Tuščia rida: kaštas be pajamų (#123). */
  emptyKm: number;
  /** Kuras, sudegintas tuščiais kilometrais. */
  emptyFuelCents: number;
  /**
   * Reiso kuro litrai pagal jo normą (importe – faktinę). Visada užpildo
   * `buildTripSummaries`; neprivalomas tik testų reisams.
   */
  fuelLitres?: number;
  revenueCents: number;
  totalCostCents: number;
  profitCents: number;
  marginPercent: number | null;
  profitPerKm: number | null;
  /** Centai per parą. `null`, kai parų nėra. */
  profitPerDayCents: number | null;
  /** Kelių kaštai pagal šalį — atskirų mokesčių čia nėra (#125). */
  roadByCountry: CountryRoad[];
  /**
   * Kaštai pagal dedamąsias – „Kur dingsta pinigai“. Visada užpildo
   * `buildTripSummaries`; neprivalomas tik tam, kad testų reisams nereikėtų jo.
   */
  costs?: CostBreakdown;
}

/** Reisas, kurio nepavyko suskaičiuoti – rodomas, kad nedingtų tyliai. */
export interface SkippedTrip {
  id: string;
  tripNumber: string;
  reason: string;
}

export function buildTripSummaries(
  trips: Trip[],
  legs: TripCountryLeg[],
  trucks: Truck[],
  tariffs: CountryTariff[],
  skipped: SkippedTrip[] = [],
): TripSummary[] {
  const trucksById = new Map(trucks.map((truck) => [truck.id, truck]));
  const legsByTrip = new Map<string, TripCountryLeg[]>();

  for (const leg of legs) {
    const tripLegs = legsByTrip.get(leg.trip_id) ?? [];
    tripLegs.push(leg);
    legsByTrip.set(leg.trip_id, tripLegs);
  }

  // Kaštai imami iš reiso kopijos, fura reikalinga tik numeriui. Reisas be
  // furos ar su ištrintu šalies įkainiu praleidžiamas ir įrašomas į `skipped`,
  // o ne meta klaidą: vienas toks reisas neturi nuversti viso sąrašo ir suvestinės.
  return trips.flatMap((trip) => {
    const truck = trucksById.get(trip.truck_id);
    if (!truck) {
      skipped.push({ id: trip.id, tripNumber: trip.trip_number, reason: "fura ištrinta" });
      return [];
    }

    let result: ReturnType<typeof calculateSavedTrip>;
    try {
      result = calculateSavedTrip(
        trip,
        (legsByTrip.get(trip.id) ?? []).map(({ country, km }) => ({ country, km })),
        trip.truck_costs,
        tariffs,
      );
    } catch (cause) {
      skipped.push({ id: trip.id, tripNumber: trip.trip_number, reason: cause instanceof Error ? cause.message : "nepavyko suskaičiuoti" });
      return [];
    }

    return [{
      id: trip.id,
      tripNumber: trip.trip_number,
      origin: trip.origin,
      destination: trip.destination,
      tripDate: trip.trip_date,
      truckPlate: truck.plate,
      customerId: trip.customer_id ?? null,
      telematikaOrderId: trip.telematika_order_id ?? null,
      ...("invoiced_on" in trip ? { invoicedOn: trip.invoiced_on ?? null, paidOn: trip.paid_on ?? null } : {}),
      paidKm: trip.paid_km,
      days: trip.days,
      emptyKm: trip.empty_km,
      emptyFuelCents: emptyFuelCents(trip.empty_km, trip.fuel_l_per_100km, trip.fuel_price),
      fuelLitres: ((trip.paid_km + trip.empty_km) * trip.fuel_l_per_100km) / 100,
      revenueCents: result.revenueCents,
      totalCostCents: result.totalCostCents,
      profitCents: result.profitCents,
      marginPercent: result.marginPercent,
      profitPerKm: result.profitPerKm,
      profitPerDayCents: result.profitPerDayCents,
      roadByCountry: tripRoadsByCountry(
        (legsByTrip.get(trip.id) ?? []).map(({ country, km }) => ({ country, km })),
        tariffs,
      ),
      costs: tripCostBreakdown(trip.truck_costs, trip.days, result),
    }];
  });
}

/** Su `id` atnaujina esamą reisą, be jo – įrašo naują (#40). */
export type TripSave = TripInsert & { id?: string };

/** Uses a database transaction so failed legs cannot leave a partial trip. */
export async function saveTrip(trip: TripSave, legs: TripCountryLegInsert[]): Promise<TripWithLegs> {
  const { data, error } = await getSupabaseClient().rpc("save_trip_with_legs", {
    trip_data: trip, legs_data: legs,
  });
  if (error) throw error;
  if (!data?.id || !Array.isArray(data.legs)) throw new Error("Invalid saved trip response.");
  return data as TripWithLegs;
}

/**
 * Sąskaitos ir apmokėjimo datos (#185). Keičiamos atskirai nuo reiso, nes
 * pildomos savaitėmis vėliau; save_trip_with_legs jų neliečia.
 */
export async function updateTripPayment(
  id: string,
  dates: { invoiced_on?: string | null; paid_on?: string | null },
): Promise<void> {
  const { data, error } = await getSupabaseClient().from("trips").update(dates).eq("id", id).select("id");
  if (error?.code === "42703" || error?.code === "PGRST204") {
    throw new Error("Apmokėjimų dar nėra duomenų bazėje – Supabase paleiskite migraciją 0015.");
  }
  if (error) throw error;
  if (!data?.length) throw new Error("Reisas nerastas. Galbūt jis ištrintas.");
}

export async function deleteTrip(id: string): Promise<void> {
  // Atkarpos išsitrina pačios (on delete cascade), svetimo reiso neleis RLS.
  const { error } = await getSupabaseClient().from("trips").delete().eq("id", id);
  if (error) throw error;
}

/** Vienas reisas su atkarpomis – redagavimo formai. */
export async function getTripWithLegs(id: string): Promise<TripWithLegs> {
  const client = getSupabaseClient();
  const [tripResult, legsResult] = await Promise.all([
    client.from("trips").select("*").eq("id", id).single(),
    client.from("trip_country_legs").select("*").eq("trip_id", id),
  ]);
  if (tripResult.error) throw tripResult.error;
  if (legsResult.error) throw legsResult.error;
  return { ...(tripResult.data as Trip), legs: (legsResult.data ?? []) as TripCountryLeg[] };
}

/**
 * PostgREST grąžina ne daugiau kaip 1000 eilučių ir apie tai nepraneša, todėl
 * be puslapiavimo suvestinė tyliai prarastų reisus ir atkarpas (AUDIT P1).
 * Užklausa turi būti rūšiuojama unikaliai, kitaip puslapiai persidengtų.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) return rows;
  }
}

const PAGE_SIZE = 1000;

export async function listTrips(skipped?: SkippedTrip[]): Promise<TripSummary[]> {
  return fetchTripSummaries(getSupabaseClient(), skipped);
}

/**
 * Tas pats sąrašas su bet kuriuo klientu – ir serverio, kad pokalbio
 * asistentas matytų tik prisijungusio vartotojo įmonės reisus (RLS).
 */
export async function fetchTripSummaries(client: SupabaseClient, skipped?: SkippedTrip[]): Promise<TripSummary[]> {
  const [trips, legs, trucksResult, tariffsResult] = await Promise.all([
    fetchAllRows<Trip>((from, to) => client.from("trips").select("*")
      .order("trip_date", { ascending: false }).order("created_at", { ascending: false }).order("id")
      .range(from, to)),
    fetchAllRows<TripCountryLeg>((from, to) => client.from("trip_country_legs").select("*").order("id").range(from, to)),
    client.from("trucks").select("*"),
    client.from("country_tariffs").select("country,rate,rate_type"),
  ]);

  const error = trucksResult.error ?? tariffsResult.error;
  if (error) throw error;

  const tariffs: CountryTariff[] = (tariffsResult.data ?? []).map((tariff) => ({
    country: tariff.country,
    rate: Number(tariff.rate),
    rateType: tariff.rate_type,
  }));

  return buildTripSummaries(
    trips,
    legs,
    (trucksResult.data ?? []) as Truck[],
    tariffs,
    skipped,
  );
}
