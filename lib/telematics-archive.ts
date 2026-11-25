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

import { plateKey, type DailyDistance } from "./telematics-costs";
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

export interface RawArchiveRow {
  feed: "orders" | "trips";
  item_key: string;
  payload: Record<string, unknown>;
}

/**
 * Orders ir Trips eilutės visos, su visais laukais (0028). Raktas – tiekėjo ID,
 * kad pakartotinis archyvavimas perrašytų, o ne dubliuotų. Kelionei be ID –
 * užsakymas + pradžia + pabaiga + vilkikas: tas pats užsakymas turi kelias atkarpas.
 */
export function rawArchiveRows(feed: "orders" | "trips", payload: unknown): RawArchiveRow[] {
  if (!Array.isArray(payload)) throw new Error(`${feed === "orders" ? "Orders" : "Trips"} atsakymas turi būti sąrašas.`);
  const rows = new Map<string, RawArchiveRow>();
  for (const row of payload) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) continue;
    const source = row as Record<string, unknown>;
    const key = feed === "orders"
      ? text(source.OrderId)
      : text(source.TripId) ?? text(source.Id)
        ?? [text(source.OrderId), text(source.DateStart), text(source.DateEnd), text(source.TruckPlates) ?? text(source.Number)].filter(Boolean).join("|");
    if (!key) continue;
    rows.set(key.slice(0, 200), { feed, item_key: key.slice(0, 200), payload: source });
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

/**
 * Archyvo ir gyvo srauto sąjunga (vartotojo sprendimas, 2026-11-25): importas
 * skaičiuoja iš abiejų, kad iš mėnesio srauto iškritę užsakymai būtų
 * perskaičiuojami ta pačia logika. Ta pati eilutė abiejuose – imama gyva.
 */
export function mergeRawPayloads(feed: "orders" | "trips", archived: unknown[], live: unknown): unknown[] {
  const fresh = Array.isArray(live) ? live : [];
  // Užsakymas dar sraute – jo atkarpos tik gyvos: Telematikoje ištrinta ar
  // perdaryta atkarpa archyve liktų kaip vaiduoklis.
  const liveOrders = new Set(feed === "trips" ? fresh.map((row) => text((row as Record<string, unknown> | null)?.OrderId)).filter(Boolean) : []);
  const kept = archived.filter((row) => !liveOrders.has(text((row as Record<string, unknown> | null)?.OrderId)));
  return rawArchiveRows(feed, [...kept, ...fresh]).map((row) => row.payload);
}

/** Archyvo pirkimas – atgal į tiekėjo pavidalą, kad jį skaitytų tas pats `parseSupplies`. */
export function supplyPayloadFromArchive(row: SupplyArchiveRow): Record<string, unknown> {
  return {
    ItemId: row.item_id,
    Plates: row.plate,
    OperationDate: row.date,
    TypeTitle: row.type_title,
    Comment: row.comment,
    Quantity: row.quantity,
    TotalPrice: row.total_price,
    CurrencyShortTitle: row.currency,
    Country: row.country,
  };
}

/** Pirkimai iš archyvo ir gyvo srauto, be dublikatų pagal `ItemId` (gyvas laimi). */
export function mergeSupplyPayloads(archived: SupplyArchiveRow[], live: unknown): unknown[] {
  const rows = new Map<string, unknown>();
  for (const row of archived) rows.set(row.item_id, supplyPayloadFromArchive(row));
  for (const row of Array.isArray(live) ? live : []) {
    const id = typeof row === "object" && row !== null ? text((row as Record<string, unknown>).ItemId) : null;
    if (id) rows.set(id, row);
  }
  return [...rows.values()];
}

/** Paros rida iš archyvo ir gyvo srauto; ta pati fura ir diena – gyva. */
export function mergeDaily(archived: DailyArchiveRow[], live: DailyDistance[]): DailyDistance[] {
  const rows = new Map<string, DailyDistance>();
  for (const row of archived) rows.set(`${plateKey(row.plate)}|${row.date}`, { plate: row.plate, date: row.date, km: row.km, fuelL: row.fuel_l });
  for (const row of live) rows.set(`${plateKey(row.plate)}|${row.date}`, row);
  return [...rows.values()];
}
