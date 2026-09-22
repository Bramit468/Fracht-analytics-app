import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { formatCents } from "@/lib/money";
import {
  parseCanDaily,
  parseSupplies,
  plateKey,
  summarizeActuals,
  type ActualCosts,
  type SupplyIssues,
} from "@/lib/telematics-costs";

import { ArchiveButton } from "./archive-button";

export const metadata: Metadata = {
  title: "Faktiniai kaštai | Fracht Analytics",
};

const DIENU_PAGAL_NUTYLEJIMA = 30;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Laikotarpis iš adreso, o be jo – paskutinės 30 dienų. */
function readRange(params: Record<string, string | string[] | undefined>) {
  const one = (name: string) => {
    const value = params[name];
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  };
  const to = one("to") ?? isoDate(new Date());
  const from = one("from") ?? isoDate(new Date(Date.now() - DIENU_PAGAL_NUTYLEJIMA * 86_400_000));
  return from <= to ? { from, to } : { from: to, to: from };
}

async function fetchJson(url: string | undefined): Promise<unknown> {
  if (!url) throw new Error("Nenurodytas adresas");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

async function loadCosts(
  from: string,
  to: string,
): Promise<{ eilutes: ActualCosts[]; issues?: SupplyIssues; klaida?: string }> {
  try {
    const [canRaw, suppliesRaw] = await Promise.all([
      fetchJson(process.env.TELEMATIKA_CANDAILY_URL),
      fetchJson(process.env.TELEMATIKA_SUPPLIES_URL),
    ]);

    const daily = parseCanDaily(canRaw);
    const { supplies, issues } = parseSupplies(suppliesRaw);

    // Tas pats numeris ateina ir su tarpu, ir be jo. Rodome variantą su tarpu,
    // nes toks pat yra furų sąraše.
    const pagalRakta = new Map<string, string>();
    for (const plate of [...daily.map((d) => d.plate), ...supplies.map((s) => s.plate)]) {
      const esamas = pagalRakta.get(plateKey(plate));
      if (!esamas || (plate.includes(" ") && !esamas.includes(" "))) {
        pagalRakta.set(plateKey(plate), plate);
      }
    }
    const plates = [...pagalRakta.values()].sort();

    // Furos, kurios per laikotarpį nei važiavo, nei pirko, sąraše tik trukdytų.
    const eilutes = plates
      .map((plate) => summarizeActuals(daily, supplies, plate, from, to))
      .filter((row) => row.km > 0 || row.totalCents > 0 || row.otherCents > 0);

    return { eilutes, issues };
  } catch {
    return {
      eilutes: [],
      klaida: "Nepavyko gauti telematikos duomenų. Patikrinkite nuorodas .env.local faile.",
    };
  }
}

function eurPerKm(totalCents: number, km: number): string {
  return km > 0 ? `${(totalCents / 100 / km).toFixed(3)} €/km` : "—";
}

export default async function TelematikaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Duomenys imami gyvai, todėl puslapis generuojamas kiekvienai užklausai.
  await connection();

  const { from, to } = readRange(await searchParams);
  const { eilutes, issues, klaida } = await loadCosts(from, to);

  const bendra = {
    km: eilutes.reduce((t, r) => t + r.km, 0),
    diesel: eilutes.reduce((t, r) => t + r.dieselCents, 0),
    adblue: eilutes.reduce((t, r) => t + r.adblueCents, 0),
    toll: eilutes.reduce((t, r) => t + r.tollCents, 0),
    kita: eilutes.reduce((t, r) => t + r.otherCents, 0),
    total: eilutes.reduce((t, r) => t + r.totalCents, 0),
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-1">
        <Link href="/" className="text-sm underline">
          Atgal į suvestinę
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Faktiniai kaštai</h1>
        <p className="text-sm text-neutral-500">
          Kilometrai ir kuras – iš vilkikų skaitiklių, kaštai – iš tikrų pirkimų. „Iš viso“
          apima kurą, AdBlue ir kelius; „Kita“ rodoma atskirai. Pajamų čia nėra: telematika
          jų su fura nesieja.
        </p>
      </header>

      <form className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          Nuo
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700"
          />
        </label>
        <label className="flex flex-col gap-1">
          Iki
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-foreground px-4 py-2 font-medium text-background"
        >
          Rodyti
        </button>
      </form>

      <section className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <p className="text-sm text-neutral-500">
          Telematika laiko tik paskutinius ~3 mėnesius. Išsaugoti duomenys lieka pas jus
          ir tada, kai tiekėjas juos pamirš.
        </p>
        <ArchiveButton />
      </section>

      {klaida && (
        <p role="alert" className="text-sm text-red-600">
          {klaida}
        </p>
      )}

      {eilutes.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="border-b">
            <tr>
              <th className="py-2 pr-4 font-medium">Fura</th>
              <th className="py-2 pr-4 text-right font-medium">km</th>
              <th className="py-2 pr-4 text-right font-medium">l/100 km</th>
              <th className="py-2 pr-4 text-right font-medium">€/l</th>
              <th className="py-2 pr-4 text-right font-medium">Kuras</th>
              <th className="py-2 pr-4 text-right font-medium">AdBlue</th>
              <th className="py-2 pr-4 text-right font-medium">Keliai</th>
              <th className="py-2 pr-4 text-right font-medium">Kita</th>
              <th className="py-2 pr-4 text-right font-medium">Iš viso</th>
              <th className="py-2 text-right font-medium">Savikaina</th>
            </tr>
          </thead>
          <tbody>
            {eilutes.map((row) => (
              <tr key={row.plate} className="border-b last:border-0">
                <td className="py-2 pr-4 font-medium">{row.plate}</td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {Math.round(row.km).toLocaleString("lt-LT")}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {row.litresPer100Km === null ? "—" : row.litresPer100Km.toFixed(1)}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {row.fuelPricePerL === null ? "—" : row.fuelPricePerL.toFixed(3)}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">{formatCents(row.dieselCents)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{formatCents(row.adblueCents)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{formatCents(row.tollCents)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{formatCents(row.otherCents)}</td>
                <td className="py-2 pr-4 text-right font-semibold tabular-nums">
                  {formatCents(row.totalCents)}
                </td>
                <td className="py-2 text-right tabular-nums">{eurPerKm(row.totalCents, row.km)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2">
            <tr className="font-semibold">
              <td className="py-2 pr-4">Iš viso</td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {Math.round(bendra.km).toLocaleString("lt-LT")}
              </td>
              <td className="py-2 pr-4" colSpan={2} />
              <td className="py-2 pr-4 text-right tabular-nums">{formatCents(bendra.diesel)}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{formatCents(bendra.adblue)}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{formatCents(bendra.toll)}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{formatCents(bendra.kita)}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{formatCents(bendra.total)}</td>
              <td className="py-2 text-right tabular-nums">
                {eurPerKm(bendra.total, bendra.km)}
              </td>
            </tr>
          </tfoot>
        </table>
      )}

      {issues && (issues.unassignedRows > 0 || issues.otherCurrencyRows > 0) && (
        <div className="text-xs text-neutral-500">
          <p className="font-medium">Į lentelę nepatenka:</p>
          {issues.unassignedRows > 0 && (
            <p>
              {issues.unassignedRows} pirkimai be furos numerio, iš viso{" "}
              {formatCents(issues.unassignedCents)} – tai įmonės lygio mokesčiai,
              konkrečiai furai jų priskirti neįmanoma.
            </p>
          )}
          {issues.otherCurrencyRows > 0 && (
            <p>{issues.otherCurrencyRows} pirkimai ne eurais – kurso spėlioti neverta.</p>
          )}
        </div>
      )}
    </main>
  );
}
