"use server";

import { refresh } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { mergeDaily, mergeRawPayloads } from "@/lib/telematics-archive";
import { readArchive } from "@/lib/telematics-archive-store";
import { canUseTelematics } from "@/lib/telematics-access";
import { parseCanDaily, plateKey } from "@/lib/telematics-costs";
import { fetchTelematics } from "@/lib/telematics-feed";
import { editedByHand, importSnapshot, parseOrderLegs, type StoredOrderTrip } from "@/lib/telematics-orders";
import { oldTripFix } from "@/lib/old-trip-days";
import { fetchAllRows } from "@/lib/trips";

export interface OldTripChange {
  id: string;
  tripNumber: string;
  tripDate: string;
  plate: string;
  daysBefore: number;
  daysAfter: number;
  dates: string[];
}

export type OldTripsResult = { ok: true; changes: OldTripChange[]; skippedByHand: number } | { ok: false; message: string };

type StoredRow = StoredOrderTrip & {
  id: string;
  trip_number: string;
  telematika_order_id: string;
  import_snapshot: (StoredOrderTrip & { old_idle_dates?: string[] }) | null;
};

/**
 * Seni importuoti reisai, kurių atkarpų neturime nei sraute, nei archyve:
 * kiek parų atimti už savaitgalį, kai fura stovėjo. Skaičiuojama serveryje ir
 * įrašant – iš naujo, naršyklės reikšmėmis nepasitikima.
 */
async function computeChanges(): Promise<OldTripsResult & { rows?: Map<string, StoredRow> }> {
  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { ok: false, message: "Prisijunkite iš naujo." };
  if (!(await canUseTelematics(supabase))) return { ok: false, message: "Telematika šiai įmonei neprijungta." };

  try {
    const [trips, trucksResult, archived, liveTrips, liveDaily] = await Promise.all([
      fetchAllRows((from, to) => supabase.from("trips")
        .select("id,trip_number,telematika_order_id,trip_date,truck_id,days,paid_km,empty_km,freight_price_cents,bridges_cents,per_diem_cents,import_snapshot")
        .not("telematika_order_id", "is", null).order("id").range(from, to)) as Promise<StoredRow[]>,
      supabase.from("trucks").select("id,plate"),
      readArchive(supabase),
      fetchTelematics("trips").catch(() => null),
      fetchTelematics("canDaily").catch(() => null),
    ]);
    const plates = new Map((trucksResult.data ?? []).map((truck) => [String(truck.id), String(truck.plate)]));
    // Užsakymai, kurių atkarpas turime, perskaičiuojami importu – čia jų nėra.
    const covered = new Set(parseOrderLegs(mergeRawPayloads("trips", archived.trips, liveTrips)).map((leg) => leg.orderId));
    const kmByDay = new Map<string, number>();
    for (const day of mergeDaily(archived.daily, liveDaily === null ? [] : parseCanDaily(liveDaily))) {
      kmByDay.set(`${plateKey(day.plate)}|${day.date}`, (kmByDay.get(`${plateKey(day.plate)}|${day.date}`) ?? 0) + day.km);
    }

    const changes: OldTripChange[] = [];
    const rows = new Map<string, StoredRow>();
    let skippedByHand = 0;
    for (const trip of trips) {
      if (covered.has(String(trip.telematika_order_id))) continue;
      // Jau pataisytas šiuo mygtuku – antrą kartą neatimama.
      if (trip.import_snapshot?.old_idle_dates) continue;
      const plate = plates.get(String(trip.truck_id));
      if (!plate) continue;
      const fix = oldTripFix(String(trip.trip_date), Number(trip.days), (date) => kmByDay.get(`${plateKey(plate)}|${date}`));
      if (!fix) continue;
      if (editedByHand(trip, trip.import_snapshot).length > 0) { skippedByHand += 1; continue; }
      rows.set(trip.id, trip);
      changes.push({ id: trip.id, tripNumber: trip.trip_number, tripDate: String(trip.trip_date), plate, daysBefore: Number(trip.days), daysAfter: fix.days, dates: fix.dates });
    }
    changes.sort((a, b) => a.tripDate.localeCompare(b.tripDate) || a.plate.localeCompare(b.plate));
    return { ok: true, changes, skippedByHand, rows };
  } catch (cause) {
    console.error("Senų reisų paros", cause);
    return { ok: false, message: "Nepavyko perskaityti reisų ar archyvo. Bandykite dar kartą." };
  }
}

export async function previewOldTrips(): Promise<OldTripsResult> {
  const result = await computeChanges();
  return result.ok ? { ok: true, changes: result.changes, skippedByHand: result.skippedByHand } : result;
}

export async function applyOldTrips(): Promise<{ ok: boolean; message: string }> {
  const result = await computeChanges();
  if (!result.ok) return result;
  const supabase = await createServerSupabaseClient();
  let saved = 0;
  for (const change of result.changes) {
    const row = result.rows!.get(change.id)!;
    // Kopijoje – naujos paros (kitaip importas palaikytų tai rankiniu taisymu) ir žymė.
    const snapshot = { ...(row.import_snapshot ?? importSnapshot(row)), days: change.daysAfter, old_idle_dates: change.dates };
    const { error } = await supabase.from("trips").update({ days: change.daysAfter, import_snapshot: snapshot }).eq("id", change.id);
    if (error) {
      console.error("Nepavyko pataisyti seno reiso parų", error);
      refresh();
      return { ok: false, message: `Įrašyta ${saved} iš ${result.changes.length}, toliau nepavyko. Bandykite dar kartą – įrašyti nebus keičiami antrą kartą.` };
    }
    saved += 1;
  }
  refresh();
  return { ok: true, message: `Pataisyta senų reisų: ${saved}.` };
}
