import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { copiedTruckIds } from "@/lib/truck-costs-bulk";
import type { Truck } from "@/types/truck";

import { CostTable } from "./cost-table";

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
      <header className="flex flex-col gap-1">
        <Link href="/trucks" className="text-sm underline">
          Atgal į furas
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Furų paros kaštai</h1>
        <p className="text-sm text-neutral-500">
          Sumos eurais už parą; priekabos nuoma — už mėnesį. Paros savikaina yra didžioji reiso
          kaštų dalis, todėl kol ji netiksli, netikslus ir kiekvienas pelno skaičius.
        </p>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          Nepavyko nuskaityti furų: {error.message}
        </p>
      ) : trucks.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Furų dar nėra. <Link href="/trucks" className="underline">Pridėkite pirmą</Link>.
        </p>
      ) : (
        <>
          {copied.size > 0 && (
            <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              Furų, kurių kaštai iki cento sutampa su kita fura: {copied.size} iš{" "}
              {trucks.length}. Tokie skaičiai būna nukopijuoti — net dvi vienodos furos
              skiriasi bent lizingo likučiu ar vairuotojo atlyginimu.
            </p>
          )}
          <CostTable trucks={trucks} copied={[...copied]} />
        </>
      )}
    </main>
  );
}
