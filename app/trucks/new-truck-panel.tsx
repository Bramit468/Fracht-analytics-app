"use client";

import { useState } from "react";

import { TruckForm } from "./truck-form";

/**
 * „Pridėti furą“ mygtukas, o forma atsiskleidžia tik jį paspaudus (#166).
 *
 * Kortelė ilga, o furų puslapį dažniausiai atidaro pažiūrėti sąrašo — todėl
 * forma neužima ekrano, kol jos neprireikia.
 */
export function NewTruckPanel() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-fit rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink"
      >
        + Pridėti furą
      </button>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Nauja fura</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-line px-3 py-1.5 text-sm"
        >
          Uždaryti
        </button>
      </div>
      <TruckForm />
    </section>
  );
}
