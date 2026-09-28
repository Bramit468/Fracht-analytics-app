import Link from "next/link";

import { TripList } from "./trip-list";

export default function TripsPage() {
  return <main className="px-4 py-8">
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Reisai</h1>
        </div>
        <div className="flex gap-3">
          <Link href="/trips/import" className="rounded-xl border border-line bg-surface px-5 py-3 font-semibold hover:bg-raised">Importas iš Excel</Link>
          <Link href="/trips/new" className="rounded-xl bg-accent px-5 py-3 font-semibold text-accent-ink hover:opacity-90">Naujas reisas</Link>
        </div>
      </div>
      <div className="mt-6"><TripList /></div>
    </div>
  </main>;
}
