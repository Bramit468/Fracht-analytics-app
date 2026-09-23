/**
 * Telematikos atsakymas -> archyvo eilutės (#54).
 *
 * Skirtumas nuo lib/telematics-costs.ts: ten atsakymas paverčiamas tuo, ką
 * rodome — atmetant, kas netelpa į kaštų modelį. Čia neatmetama **niekas**.
 *
 * Tiekėjas laiko tik ~3 mėnesius, tad tai, ko neišsaugosim šiandien, dings.
 * O ką su eilute daryti, spręsim vėliau ir ne kartą: `supplyKind` jau keitėsi
 * (#49) ir dar keisis. Perskaičiuoti praeitį galima tik turint tai, ką
 * atsiuntė tiekėjas, todėl saugome neapdorota.
 */

import { normalizePlate } from "./truck";

export interface DailyArchiveRow {
  plate: string;
  date: string;
  km: number;
  fuel_l: number | null;
}

export interface SupplyArchiveRow {
  item_id: string;
  /** Be numerio – įmonės lygio pirkimas ar grąžinimas. Saugomas kaip yra. */
  plate: string | null;
  date: string;
  type_title: string | null;
  comment: string | null;
  quantity: number | null;
  total_price: number;
  currency: string;
  country: string | null;
}

function text(value: unknown): string | null {
  if (typeof value === "number") return String(value);
  return typeof value === "string" && value !== "" ? value : null;
}

function decimal(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = text(value);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** "2026-09-01 08:12:00" ir "2026-09-01" – abu tampa "2026-09-01". */
function isoDate(value: string): string {
  return value.slice(0, 10);
}

export function dailyArchiveRows(payload: unknown): DailyArchiveRow[] {
  if (!Array.isArray(payload)) throw new Error("CANDaily atsakymas turi būti sąrašas.");

  const rows = new Map<string, DailyArchiveRow>();

  for (const row of payload) {
    if (typeof row !== "object" || row === null) continue;
    const source = row as Record<string, unknown>;

    const plateRaw = text(source.Plates);
    const dateRaw = text(source.Date);
    const km = decimal(source.DayDistance);
    if (!plateRaw || !dateRaw || km === null || km < 0) continue;

    const plate = normalizePlate(plateRaw);
    const date = isoDate(dateRaw);

    // Numeris ateina ir „lov 141", ir „LOV 141"; suvienodintas jis yra
    // lentelės rakto dalis, tad tas pats raktas atsakyme negali pasitaikyti
    // dukart – Postgres tokio įrašymo nepriimtų.
    rows.set(`${plate}|${date}`, { plate, date, km, fuel_l: decimal(source.DayFuelConsumption) });
  }

  return [...rows.values()];
}

export function supplyArchiveRows(payload: unknown): SupplyArchiveRow[] {
  if (!Array.isArray(payload)) throw new Error("Supplies atsakymas turi būti sąrašas.");

  const rows = new Map<string, SupplyArchiveRow>();

  for (const row of payload) {
    if (typeof row !== "object" || row === null) continue;
    const source = row as Record<string, unknown>;

    const itemId = text(source.ItemId);
    const dateRaw = text(source.OperationDate);
    const totalPrice = decimal(source.TotalPrice);
    const currency = text(source.CurrencyShortTitle);

    // Be šitų keturių eilutė nei identifikuojama, nei naudinga.
    if (!itemId || !dateRaw || totalPrice === null || !currency) continue;

    const plateRaw = text(source.Plates) ?? text(source.Number);

    rows.set(itemId, {
      item_id: itemId,
      plate: plateRaw === null ? null : normalizePlate(plateRaw),
      date: isoDate(dateRaw),
      type_title: text(source.TypeTitle),
      comment: text(source.Comment),
      quantity: decimal(source.Quantity),
      total_price: totalPrice,
      currency,
      country: text(source.Country),
    });
  }

  return [...rows.values()];
}
