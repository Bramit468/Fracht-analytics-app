import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { copiedTruckIds } from "@/lib/truck-costs-bulk";
import type { Truck } from "@/types/truck";

import { trucksMissingWeights } from "@/lib/truck-weights-bulk";

import { AppNav } from "../../app-nav";
import { CostTable } from "./cost-table";
import { WeightTable } from "./weight-table";

export const metadata: Metadata = {
  title: "Furų kaštai | Fracht Analytics",
};

export default async function TruckCostsPage() {
  // Reikšmės keičiasi, todėl puslapis generuojamas kiekvienai užklausai.
  await connection();

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
      <AppNav />
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Furų paros kaštai</h1>
        <p className="text-sm text-muted">
          Sumos eurais už parą; priekabos nuoma — už mėnesį. Paros savikaina yra didžioji reiso
          kaštų dalis, todėl kol ji netiksli, netikslus ir kiekvienas pelno skaičius.
        </p>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-bad">
          Nepavyko nuskaityti furų: {error.message}
        </p>
      ) : trucks.length === 0 ? (
        <p className="text-sm text-muted">
          Furų dar nėra. <Link href="/trucks" className="underline">Pridėkite pirmą</Link>.
        </p>
      ) : (
        <>
          {copied.size > 0 && (
            <p className="rounded-xl border border-warn bg-warn-soft p-4 text-sm text-warn  ">
              Furų, kurių kaštai iki cento sutampa su kita fura: {copied.size} iš{" "}
              {trucks.length}. Tokie skaičiai būna nukopijuoti — net dvi vienodos furos
              skiriasi bent lizingo likučiu ar vairuotojo atlyginimu.
            </p>
          )}
          <CostTable trucks={trucks} copied={[...copied]} />

          <section className="mt-4 flex flex-col gap-3 border-t pt-8">
            <h2 className="text-lg font-medium">Svoriai maršruto skaičiavimui</h2>
            <p className="text-sm text-muted">
              Pagal juos PTV skaičiuoja kurą ir CO₂ konkrečiam maršrutui. Nežinant palikite
              tuščią — spėtas svoris duotų tikslų atrodantį, bet neteisingą skaičių.
            </p>
            <WeightTable trucks={trucks} missing={trucksMissingWeights(trucks).length} />
          </section>
        </>
      )}
    </main>
  );
}
