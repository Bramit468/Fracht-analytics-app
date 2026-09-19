import Link from "next/link";
import { TripList } from "./trip-list";

export default function TripsPage() {
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/" className="text-sm underline">Back to dashboard</Link>
          <h1 className="mt-4 text-3xl font-semibold">Trips</h1>
        </div>
        <Link href="/trips/new" className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">New trip</Link>
      </div>
      <div className="mt-6"><TripList /></div>
    </div>
  </main>;
}
