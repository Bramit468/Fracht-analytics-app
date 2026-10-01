import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { calcDailyRate } from "@/lib/calc";
import { todayInVilnius } from "@/lib/local-date";
import { formatCents } from "@/lib/money";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { truckRowToCalc } from "@/lib/truck";
import { copiedTruckIds } from "@/lib/truck-costs-bulk";
import { documentAlerts, documentAlertText } from "@/lib/truck-profile";
import { parseTruckTab, TRUCK_TABS, truckTabHref, type TruckTab } from "@/lib/truck-tabs";
import { trucksMissingWeights } from "@/lib/truck-weights-bulk";
import type { Truck } from "@/types/truck";

import { CostTable } from "./cost-table";
import { NewTruckPanel } from "./new-truck-panel";
import { TruckRowActions } from "./truck-row-actions";
import { WeightTable } from "./weight-table";

export const metadata: Metadata = {
  title: "Furos | Bramit",
};

/** Furos, jų paros kaštai ir svoriai – viename puslapyje (#169). */
export default async function TrucksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Sąrašas keičiasi, todėl puslapis generuojamas kiekvienai užklausai,
  // o ne vieną kartą build metu.
  await connection();

  const tab = parseTruckTab((await searchParams).skiltis);

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("trucks")
    .select("*")
    .order("plate")
    .overrideTypes<Truck[], { merge: false }>();
  const trucks = data ?? [];
  const copied = copiedTruckIds(trucks);

  return (
    <main className="mx-auto flex w-full max-w-[110rem] flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Furos</h1>
        <p className="text-sm text-muted">
          Paros savikaina — kiek fura kainuoja kiekvieną parą, net stovėdama. Tai didžioji reiso
          kaštų dalis, todėl kol ji netiksli, netikslus ir kiekvienas pelno skaičius.
        </p>
      </header>

      <NewTruckPanel />

      <Tabs active={tab} />

      {error ? (
        <p role="alert" className="text-sm text-bad">
          Nepavyko nuskaityti furų: {error.message}
        </p>
      ) : trucks.length === 0 ? (
        <p className="text-sm text-muted">Furų dar nėra. Spauskite „Pridėti furą“.</p>
      ) : (
        <>
          {copied.size > 0 && tab !== "svoriai" && (
            <p className="rounded-xl border border-warn bg-warn-soft p-4 text-sm text-warn">
              Furų, kurių kaštai iki cento sutampa su kita fura: {copied.size} iš {trucks.length}.
              Tokie skaičiai būna nukopijuoti — net dvi vienodos furos skiriasi bent lizingo likučiu
              ar vairuotojo atlyginimu.{" "}
              {tab === "sarasas" && (
                <Link href={truckTabHref("kastai")} className="font-medium underline">
                  Patikslinti kaštus
                </Link>
              )}
            </p>
          )}

          {tab === "sarasas" && <TruckList trucks={trucks} copied={copied} />}

          {tab === "kastai" && (
            <section className="flex flex-col gap-3">
              <p className="text-sm text-muted">
                Sumos eurais už parą; priekabos nuoma — už mėnesį. Visų furų kaštai išsaugomi vienu
                mygtuku.
              </p>
              <CostTable trucks={trucks} copied={[...copied]} />
            </section>
          )}

          {tab === "svoriai" && (
            <section className="flex flex-col gap-3">
              <p className="text-sm text-muted">
                Pagal juos PTV skaičiuoja kurą ir CO₂ konkrečiam maršrutui. Nežinant palikite
                tuščią — spėtas svoris duotų tikslų atrodantį, bet neteisingą skaičių.
              </p>
              <WeightTable trucks={trucks} missing={trucksMissingWeights(trucks).length} />
            </section>
          )}
        </>
      )}
    </main>
  );
}

function Tabs({ active }: { active: TruckTab }) {
  return (
    <nav aria-label="Furų skiltys" className="flex gap-1 border-b border-line">
      {TRUCK_TABS.map(({ key, label }) => (
        <Link
          key={key}
          href={truckTabHref(key)}
          aria-current={key === active ? "page" : undefined}
          className={
            key === active
              ? "-mb-px border-b-2 border-good px-4 py-2 text-sm font-medium"
              : "-mb-px border-b-2 border-transparent px-4 py-2 text-sm text-muted hover:text-ink"
          }
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

function TruckList({ trucks, copied }: { trucks: Truck[]; copied: Set<string> }) {
  const today = todayInVilnius();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            <th className="py-2 pr-4 font-medium">Numeris</th>
            <th className="py-2 pr-4 text-right font-medium">Paros savikaina</th>
            <th className="py-2 pr-4 text-right font-medium">Priekaba / mėn.</th>
            <th className="py-2 pr-4 text-right font-medium">Darbo dienos</th>
            <th className="py-2 text-right font-medium">
              <span className="sr-only">Veiksmai</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {trucks.map((truck) => (
            <tr key={truck.id} className="border-b border-line">
              <td className="py-2 pr-4">
                <TruckIdentity truck={truck} today={today} />
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {formatCents(calcDailyRate(truckRowToCalc(truck)))}
                {copied.has(truck.id) && (
                  <span
                    title="Šios furos kaštai iki cento sutampa su kita fura — greičiausiai nukopijuoti."
                    className="block text-xs text-warn"
                  >
                    nepatikslinta
                  </span>
                )}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {formatCents(truck.trailer_monthly_cents)}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">{truck.working_days_per_month}</td>
              <td className="py-2 text-right">
                <TruckRowActions id={truck.id} plate={truck.plate} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Numeris, markė su modeliu ir dokumentai, kurie baigiasi per 30 dienų (#164).
 * Pasibaigęs dokumentas raudonas: tokia fura legaliai važiuoti negali.
 */
function TruckIdentity({ truck, today }: { truck: Truck; today: string }) {
  const description = [truck.make, truck.model].filter(Boolean).join(" ");
  const alerts = documentAlerts(truck, today);

  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono">{truck.plate}</span>
      {description && <span className="text-xs text-muted">{description}</span>}
      {alerts.map((alert) => (
        <span
          key={alert.label}
          className={
            alert.days < 0
              ? "w-fit rounded bg-bad-soft px-1.5 text-xs text-bad"
              : "w-fit rounded bg-warn-soft px-1.5 text-xs text-warn"
          }
        >
          {documentAlertText(alert)}
        </span>
      ))}
    </div>
  );
}
