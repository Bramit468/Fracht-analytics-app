import Link from "next/link";

import { AppNav } from "../app-nav";
import { TripList } from "./trip-list";

export default function TripsPage() {
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
    <div className="mx-auto max-w-4xl">
      <AppNav className="mb-6" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Reisai</h1>
        </div>
        <div className="flex gap-3">
          <Link href="/trips/import" className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold hover:bg-slate-100">Importas iš Excel</Link>
          <Link href="/trips/new" className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">Naujas reisas</Link>
        </div>
      </div>
      <div className="mt-6"><TripList /></div>
    </div>
  </main>;
}
