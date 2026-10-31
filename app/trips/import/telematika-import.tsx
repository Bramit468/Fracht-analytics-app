"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ensureCustomer, listCustomers, type Customer } from "../../../lib/customers";
import { formatCents } from "../../../lib/money";
import { getSupabaseClient } from "../../../lib/supabase";
import { listTrips, saveTrip, type TripSummary } from "../../../lib/trips";
import { buttonPrimary } from "../../ui";
import { importSnapshot } from "../../../lib/telematics-orders";
import { loadTelematikaOrders, ptvRouteKm, type OrderPreview } from "./telematika-orders";

const km = (value: number) => Math.round(value).toLocaleString("lt-LT");

/** Tiek naujausių importuotų reisų rodoma – visi yra reisų sąraše. */
const SHOWN = 100;

interface ImportSummary {
  created: number;
  updated: { orderId: string; number: string; changes: string[] }[];
  /** Pataisyti ranka – Telematikos pakeitimai neįrašyti. */
  keptManual: { orderId: string; number: string; fields: string[] }[];
  unchanged: number;
  skipped: { orderId: string; label: string; reason: string }[];
  ptvMisses: string[];
  failures: string[];
  /** Ką teko spėti įrašytuose reisuose. */
  guesses: string[];
  unassignedTollCents: number;
  unassignedEmptyKm: number;
}

/** Praleidimo priežastys suskaičiuotos: „furos nėra sąraše – 3“. */
function reasonCounts(skipped: ImportSummary["skipped"]): string {
  const counts = skipped.reduce<Record<string, number>>((all, item) => {
    const reason = (item.reason.startsWith("Furos ") ? "Furos nėra sąraše." : item.reason).replace(/\.$/, "").toLowerCase();
    all[reason] = (all[reason] ?? 0) + 1;
    return all;
  }, {});
  return Object.entries(counts).map(([reason, count]) => `${reason} – ${count}`).join("; ");
}

/**
 * Užsakymai iš Telematikos vienu mygtuku.
 *
 * Atidarius rodomi jau importuoti reisai iš duomenų bazės – Telematikos
 * nekviečiant. Mygtukas paima užsakymus ir įrašo tik naujus ar pakitusius:
 * nepakitę neperrašomi, kad jų furos kaštų kopija liktų ta pati. Tiekėjas
 * duoda tik paskutinį mėnesį, todėl atnaujinti verta bent kas kelias savaites.
 */
export function TelematikaImport() {
  const [imported, setImported] = useState<TripSummary[] | null>(null);
  const [listError, setListError] = useState("");
  const [reload, setReload] = useState(0);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    listTrips()
      .then((trips) => { if (!cancelled) { setImported(trips.filter((trip) => trip.telematikaOrderId)); setListError(""); } })
      .catch(() => { if (!cancelled) setListError("Nepavyko nuskaityti importuotų reisų. Atnaujinkite puslapį."); });
    return () => { cancelled = true; };
  }, [reload]);

  async function save(items: OrderPreview[]): Promise<Pick<ImportSummary, "ptvMisses" | "failures"> & { saved: Set<string> }> {
    const failures: string[] = [];
    const ptvMisses: string[] = [];
    const saved = new Set<string>();
    let ptvStopped = false;
    const client = getSupabaseClient();
    const { customers: loaded, available } = await listCustomers(client);
    const customers: Customer[] = [...loaded];
    for (const [index, item] of items.entries()) {
      setProgress(`Įrašoma ${index + 1} iš ${items.length}…`);
      try {
        let customerId: string | null = null;
        if (available && item.customer) {
          const customer = await ensureCustomer(client, customers, item.customer);
          if (!customers.some((known) => known.id === customer.id)) customers.push(customer);
          customerId = customer.id;
        }
        let trip = item.trip;
        let legs = item.legs;
        // Telematikoje km nėra – PTV per pakrautų atkarpų adresus. Nepavykus
        // lieka paros ridos įvertis, ir tai pasakoma.
        if (item.kmAddresses && item.storedPaidKm !== null && item.storedPaidKm > 0) {
          // Jau importuotas: km tie patys, kuriuos PTV suskaičiavo anksčiau.
          trip = { ...trip, paid_km: item.storedPaidKm };
          legs = [{ country: "Nemokami", km: Math.round((item.storedPaidKm + trip.empty_km) * 100) / 100 }];
        } else if (item.kmAddresses && !ptvStopped) {
          const route = await ptvRouteKm(item.kmAddresses);
          if (route.ok) {
            const paidKm = Math.round(route.km * 100) / 100;
            trip = { ...trip, paid_km: paidKm };
            legs = [{ country: "Nemokami", km: Math.round((paidKm + trip.empty_km) * 100) / 100 }];
          } else {
            ptvMisses.push(`${item.trip.trip_number}: ${route.message}`);
            if (route.quota) ptvStopped = true;
          }
        }
        // Kopija – kad kitas atnaujinimas atskirtų rankinį pataisymą nuo Telematikos pakeitimo.
        await saveTrip({ ...trip, id: item.existingId ?? undefined, import_snapshot: importSnapshot(trip), ...(available ? { customer_id: customerId } : {}) }, legs);
        saved.add(item.orderId);
      } catch {
        failures.push(`${item.trip.trip_number} (${item.trip.trip_date})`);
      }
    }
    return { ptvMisses, failures, saved };
  }

  async function refresh() {
    setRunning(true);
    setError("");
    setSummary(null);
    setProgress("Gaunama iš Telematikos…");
    try {
      const result = await loadTelematikaOrders();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const toSave = result.trips.filter((item) => item.changes === null || (item.changes.length > 0 && item.handEdited.length === 0));
      const keptManual = result.trips.filter((item) => item.changes !== null && item.changes.length > 0 && item.handEdited.length > 0);
      const { ptvMisses, failures, saved } = await save(toSave);
      const done = toSave.filter((item) => saved.has(item.orderId));
      setSummary({
        created: done.filter((item) => item.changes === null).length,
        updated: done.filter((item) => item.changes !== null).map((item) => ({ orderId: item.orderId, number: item.trip.trip_number, changes: item.changes ?? [] })),
        keptManual: keptManual.map((item) => ({ orderId: item.orderId, number: item.trip.trip_number, fields: item.handEdited })),
        unchanged: result.trips.length - toSave.length - keptManual.length,
        skipped: result.skipped.map((item) => ({ orderId: item.orderId, label: item.orderNo || `TLM ${item.orderId}`, reason: item.reason })),
        ptvMisses,
        failures,
        guesses: done.filter((item) => item.notes.length > 0).map((item) => `${item.trip.trip_number}: ${item.notes.join(" ")}`),
        unassignedTollCents: result.unassignedTollCents,
        unassignedEmptyKm: result.unassignedEmptyKm,
      });
      setReload((value) => value + 1);
    } catch {
      setError("Nepavyko atnaujinti. Patikrinkite ryšį ir bandykite dar kartą.");
    } finally {
      setRunning(false);
      setProgress("");
    }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void refresh()} disabled={running} className={buttonPrimary}>
        {running ? "Atnaujinama…" : "Atnaujinti iš Telematikos"}
      </button>
      {progress && <p role="status" className="text-sm">{progress}</p>}
    </div>

    {error && <p role="alert" className="text-sm text-bad">{error}</p>}

    {summary && <div role="status" className="space-y-2 rounded-lg border border-line bg-page px-4 py-3 text-sm">
      <p>
        <span className="font-medium">Nauji: {summary.created}</span> · atnaujinti: {summary.updated.length} · nepakito: {summary.unchanged}
        {summary.skipped.length > 0 && <> · praleista: {summary.skipped.length} ({reasonCounts(summary.skipped)})</>}.
        {summary.unassignedTollCents > 0 && <> Kelių mokesčių dienomis be užsakymų: {formatCents(summary.unassignedTollCents)} – jie reisams nepriskirti.</>}
        {summary.unassignedEmptyKm > 0 && <> Km be užsakymo, po kurių kito užsakymo nebuvo (grįžimas į bazę, stovėjimas): {summary.unassignedEmptyKm.toLocaleString("lt-LT")} km – nepriskirti.</>}
      </p>
      {summary.failures.length > 0 && <p role="alert" className="text-bad">
        Neįrašyti: {summary.failures.join(", ")}. Dažniausia priežastis – nepaleista migracija 0019 arba trūksta „Nemokami“ įkainio.
      </p>}
      {summary.ptvMisses.length > 0 && <details className="text-warn">
        <summary className="cursor-pointer">PTV km neapskaičiuoti: {summary.ptvMisses.length} – jiems liko paros ridos įvertis</summary>
        <ul className="mt-1 space-y-0.5">{summary.ptvMisses.map((line) => <li key={line}>{line}</li>)}</ul>
      </details>}
      {summary.keptManual.length > 0 && <details>
        <summary className="cursor-pointer text-muted">Pakeisti ranka, neatnaujinta ({summary.keptManual.length})</summary>
        <p className="mt-1 text-xs text-muted">Telematikoje šie užsakymai pasikeitė, bet reisai pataisyti ranka, todėl paliekami kaip yra.</p>
        <ul className="mt-1 space-y-0.5">{summary.keptManual.map((item) => <li key={item.orderId}>{item.number}: taisyta {item.fields.join(", ")}</li>)}</ul>
      </details>}
      {summary.updated.length > 0 && <details>
        <summary className="cursor-pointer text-muted">Kas atnaujinta ({summary.updated.length})</summary>
        <ul className="mt-1 space-y-0.5">{summary.updated.map((item) => <li key={item.orderId}>{item.number}: {item.changes.join(", ")}</li>)}</ul>
      </details>}
      {summary.guesses.length > 0 && <details>
        <summary className="cursor-pointer text-muted">Ką teko spėti ({summary.guesses.length})</summary>
        <ul className="mt-1 space-y-0.5">{summary.guesses.map((line) => <li key={line}>{line}</li>)}</ul>
      </details>}
      {summary.skipped.length > 0 && <details>
        <summary className="cursor-pointer text-muted">Praleisti užsakymai ({summary.skipped.length})</summary>
        <ul className="mt-1 space-y-0.5">{summary.skipped.map((item) => <li key={item.orderId}>{item.label} – {item.reason}</li>)}</ul>
      </details>}
    </div>}

    {listError && <p role="alert" className="text-sm text-bad">{listError}</p>}
    {imported === null && !listError && <p role="status" className="text-sm text-muted">Kraunami importuoti reisai…</p>}
    {imported?.length === 0 && <p className="text-sm text-muted">Importuotų reisų dar nėra – paspauskite „Atnaujinti iš Telematikos“.</p>}
    {imported && imported.length > 0 && <>
      <p className="text-sm text-muted">
        Importuota reisų: {imported.length}{imported.length > SHOWN && ` – rodomi naujausi ${SHOWN}, visi yra reisų sąraše`}.
      </p>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-muted">
            <th className="px-3 py-2.5 font-medium">Data</th>
            <th className="px-3 py-2.5 font-medium">Užsakymas</th>
            <th className="px-3 py-2.5 font-medium">Maršrutas</th>
            <th className="px-3 py-2.5 font-medium">Fura</th>
            <th className="px-3 py-2.5 text-right font-medium">Paros</th>
            <th className="px-3 py-2.5 text-right font-medium">Km apm. / tušti</th>
            <th className="px-3 py-2.5 text-right font-medium">Kaina</th>
            <th className="px-3 py-2.5 text-right font-medium">Pelnas</th>
          </tr></thead>
          <tbody>{imported.slice(0, SHOWN).map((trip) => <tr key={trip.id} className="border-b border-line align-top last:border-b-0">
            <td className="whitespace-nowrap px-3 py-2 tabular-nums">{trip.tripDate}</td>
            <td className="px-3 py-2"><Link href={`/trips/${trip.id}/edit`} className="hover:underline">{trip.tripNumber}</Link></td>
            <td className="px-3 py-2">{trip.origin} → {trip.destination}</td>
            <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{trip.truckPlate}</td>
            <td className="px-3 py-2 text-right tabular-nums">{trip.days.toFixed(2).replace(".", ",")}</td>
            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{km(trip.paidKm)} / {km(trip.emptyKm)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatCents(trip.revenueCents)}</td>
            <td className={`px-3 py-2 text-right tabular-nums ${trip.profitCents < 0 ? "text-bad" : ""}`}>
              {formatCents(trip.profitCents)}
              {trip.marginPercent !== null && <span className="block text-xs text-muted">{trip.marginPercent.toFixed(1)} %</span>}
            </td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </div>;
}
