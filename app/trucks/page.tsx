import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { calcDailyRate } from "@/lib/calc";
import { todayInVilnius } from "@/lib/local-date";
import { formatCents } from "@/lib/money";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { truckRowToCalc } from "@/lib/truck";
import { documentAlerts, documentAlertText } from "@/lib/truck-profile";
import type { Truck } from "@/types/truck";

import { TruckForm } from "./truck-form";
import { TruckRowActions } from "./truck-row-actions";

export const metadata: Metadata = {
  title: "Furos | Bramit",
};

export default async function TrucksPage() {
  // Sąrašas keičiasi, todėl puslapis generuojamas kiekvienai užklausai,
  // o ne vieną kartą build metu.
  await connection();

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("trucks")
    .select("*")
    .order("plate")
    .overrideTypes<Truck[], { merge: false }>();
  const today = todayInVilnius();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Furos</h1>
        <p className="text-sm text-muted">
          Paros savikaina — kiek fura kainuoja kiekvieną parą, net stovėdama.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Sąrašas</h2>
          <Link href="/trucks/kastai" className="text-sm underline">
            Taisyti visų kaštus vienoje lentelėje
          </Link>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-bad">
            Nepavyko nuskaityti furų: {error.message}
          </p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted">Furų dar nėra. Pridėkite pirmą žemiau.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left ">
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
                {data.map((truck) => (
                  <tr
                    key={truck.id}
                    className="border-b border-line "
                  >
                    <td className="py-2 pr-4">
                      <TruckIdentity truck={truck} today={today} />
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatCents(calcDailyRate(truckRowToCalc(truck)))}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatCents(truck.trailer_monthly_cents)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {truck.working_days_per_month}
                    </td>
                    <td className="py-2 text-right">
                      <TruckRowActions id={truck.id} plate={truck.plate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Nauja fura</h2>
        <TruckForm />
      </section>
    </main>
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
