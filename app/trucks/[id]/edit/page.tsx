import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { Truck } from "@/types/truck";

import { TruckForm } from "../../truck-form";

export const metadata: Metadata = {
  title: "Furos taisymas | Bramit",
};

export default async function EditTruckPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Furos duomenys keičiasi, todėl puslapis generuojamas kiekvienai užklausai.
  await connection();

  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("trucks")
    .select("*")
    .eq("id", id)
    .limit(1)
    .overrideTypes<Truck[], { merge: false }>();

  const truck = data?.[0];

  // Svetimos įmonės furos RLS negrąžins — vartotojui tai tas pats, kas nėra.
  if (error || !truck) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">
          Fura {truck.plate}
        </h1>
        <p className="text-sm text-muted">
          Pakeisti kaštai galios tik naujiems reisams — seni reisai saugo savo kaštų kopiją.
        </p>
      </header>

      <TruckForm truck={truck} />
    </main>
  );
}
