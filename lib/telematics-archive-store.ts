/**
 * Archyvo įrašymas ir skaitymas su vartotojo teisėmis (RLS), kaip visur.
 *
 * Rašo ir Analizės mygtukas, ir kiekvienas „Atnaujinti iš Telematikos“
 * (2026-11-25), kad archyvas nenutrūktų: srautai siekia tik mėnesį ar tris.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { dailyArchiveRows, rawArchiveRows, supplyArchiveRows, type DailyArchiveRow, type RawArchiveRow, type SupplyArchiveRow } from "./telematics-archive";
import { fetchAllRows } from "./trips";

/** Vienu įrašymu siunčiamų eilučių riba, kad užklausa neišaugtų per didelė. */
const PORCIJA = 500;

function missingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

export interface ArchiveWriteResult {
  /** `null` – pavyko; kitaip – žmogui skirta klaida. */
  error: string | null;
  dailyRows: number;
  supplyRows: number;
  rawSaved: number;
  /** Nėra 0028 lentelės – užsakymai ir kelionės praleisti. */
  rawMissing: boolean;
}

/** Įrašo tiekėjo atsakymus `upsert` pagal raktą: kartoti saugu. `null` srautas praleidžiamas. */
export async function writeArchive(
  supabase: SupabaseClient,
  feeds: { canDaily: unknown; supplies: unknown; orders: unknown | null; trips: unknown | null },
): Promise<ArchiveWriteResult> {
  const daily = dailyArchiveRows(feeds.canDaily);
  const supplies = supplyArchiveRows(feeds.supplies);
  let raw: RawArchiveRow[] = [];
  if (feeds.orders !== null) raw = raw.concat(rawArchiveRows("orders", feeds.orders));
  if (feeds.trips !== null) raw = raw.concat(rawArchiveRows("trips", feeds.trips));
  const result: ArchiveWriteResult = { error: null, dailyRows: daily.length, supplyRows: supplies.length, rawSaved: 0, rawMissing: false };

  for (let i = 0; i < daily.length; i += PORCIJA) {
    const { error } = await supabase.from("telematics_daily").upsert(daily.slice(i, i + PORCIJA), { onConflict: "company_id,plate,date" });
    if (error) {
      console.error("Nepavyko archyvuoti paros eilučių", error);
      return { ...result, error: "Nepavyko įrašyti paros duomenų. Ar pritaikyta migracija 0008?" };
    }
  }
  for (let i = 0; i < supplies.length; i += PORCIJA) {
    const { error } = await supabase.from("telematics_supplies").upsert(supplies.slice(i, i + PORCIJA), { onConflict: "company_id,item_id" });
    if (error) {
      console.error("Nepavyko archyvuoti pirkimų", error);
      return { ...result, error: "Nepavyko įrašyti pirkimų. Ar pritaikyta migracija 0008?" };
    }
  }
  // Užsakymų ir kelionių visi laukai (0028). Be migracijos – praleidžiama, ne klaida.
  for (let i = 0; i < raw.length; i += PORCIJA) {
    const { error } = await supabase.from("telematics_raw").upsert(raw.slice(i, i + PORCIJA), { onConflict: "company_id,feed,item_key" });
    if (error) {
      result.rawMissing = missingTable(error);
      if (!result.rawMissing) console.error("Nepavyko archyvuoti užsakymų", error);
      break;
    }
    result.rawSaved += Math.min(PORCIJA, raw.length - i);
  }
  return result;
}

export interface ArchivedSources {
  orders: unknown[];
  trips: unknown[];
  daily: DailyArchiveRow[];
  supplies: SupplyArchiveRow[];
}

/** Visas įmonės archyvas. Kol migracijų nėra – tuščias, ne klaida. */
export async function readArchive(supabase: SupabaseClient): Promise<ArchivedSources> {
  // Rikiavimas – pagal unikalų raktą, kitaip puslapiuojant eilutės praslystų.
  const all = async <T>(table: string, columns: string, order: string[], feed?: string): Promise<T[]> => {
    try {
      return await fetchAllRows<T>((from, to) => {
        let query = supabase.from(table).select(columns);
        if (feed) query = query.eq("feed", feed);
        for (const column of order) query = query.order(column);
        return query.range(from, to) as unknown as PromiseLike<{ data: T[] | null; error: unknown }>;
      });
    } catch (error) {
      if (missingTable(error as { code?: string })) return [];
      throw error;
    }
  };
  const [orders, trips, daily, supplies] = await Promise.all([
    all<{ payload: unknown }>("telematics_raw", "payload", ["item_key"], "orders"),
    all<{ payload: unknown }>("telematics_raw", "payload", ["item_key"], "trips"),
    all<DailyArchiveRow>("telematics_daily", "plate,date,km,fuel_l", ["date", "plate"]),
    all<SupplyArchiveRow>("telematics_supplies", "item_id,plate,date,type_title,comment,quantity,total_price,currency,country", ["item_id"]),
  ]);
  return {
    orders: orders.map((row) => row.payload),
    trips: trips.map((row) => row.payload),
    daily: daily.map((row) => ({ ...row, km: Number(row.km), fuel_l: row.fuel_l === null ? null : Number(row.fuel_l) })),
    supplies: supplies.map((row) => ({ ...row, quantity: row.quantity === null ? null : Number(row.quantity), total_price: Number(row.total_price) })),
  };
}
