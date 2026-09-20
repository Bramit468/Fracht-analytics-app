import Link from "next/link";
import { Dashboard } from "./dashboard";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">Fracht Analytics</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Trip profitability</h1>
            <p className="mt-2 text-slate-600">An overview of every saved trip.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold transition hover:bg-slate-100" href="/trips/import">Import Excel</Link>
            <Link className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold transition hover:bg-slate-100" href="/trips">View trips</Link>
            <Link className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700" href="/trips/new">New trip</Link>
          </div>
        </div>
        <section aria-labelledby="overview-heading" className="mt-10">
          <h2 id="overview-heading" className="mb-4 text-lg font-semibold">Overview</h2>
          <Dashboard />
        </section>
      </div>
    </main>
  );
}
