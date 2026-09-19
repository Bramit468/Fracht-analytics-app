import type { Metadata } from "next";
import { connection } from "next/server";

import { calcDailyRate } from "@/lib/calc";
import { formatCents } from "@/lib/money";
import { getSupabaseClient } from "@/lib/supabase";
import { truckRowToCalc } from "@/lib/truck";
import type { Truck } from "@/types/truck";

import { TruckForm } from "./truck-form";

export const metadata: Metadata = {
  title: "Furos | Fracht Analytics",
};

export default async function TrucksPage() {
  // Sąrašas keičiasi, todėl puslapis generuojamas kiekvienai užklausai,
  // o ne vieną kartą build metu.
  await connection();

  const { data, error } = await getSupabaseClient()
    .from("trucks")
    .select("*")
    .order("plate")
    .overrideTypes<Truck[], { merge: false }>();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Furos</h1>
        <p className="text-sm text-neutral-500">
          Paros savikaina — kiek fura kainuoja kiekvieną parą, net stovėdama.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Sąrašas</h2>
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            Nepavyko nuskaityti furų: {error.message}
          </p>
        ) : data.length === 0 ? (
          <p className="text-sm text-neutral-500">Furų dar nėra. Pridėkite pirmą žemiau.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-300 text-left dark:border-neutral-700">
                  <th className="py-2 pr-4 font-medium">Numeris</th>
                  <th className="py-2 pr-4 text-right font-medium">Paros savikaina</th>
                  <th className="py-2 pr-4 text-right font-medium">Priekaba / mėn.</th>
                  <th className="py-2 text-right font-medium">Darbo dienos</th>
                </tr>
              </thead>
              <tbody>
                {data.map((truck) => (
                  <tr
                    key={truck.id}
                    className="border-b border-neutral-200 dark:border-neutral-800"
                  >
                    <td className="py-2 pr-4 font-mono">{truck.plate}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatCents(calcDailyRate(truckRowToCalc(truck)))}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatCents(truck.trailer_monthly_cents)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {truck.working_days_per_month}
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
