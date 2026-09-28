import Link from "next/link";

import { Dashboard } from "./dashboard";

export default function Home() {
  // Meniu ir rėmas gyvena maketo lygyje (`app/app-shell.tsx`), todėl puslapis
  // rūpinasi tik savo turiniu (#145).
  return (
    <main className="w-full px-4 py-7 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Reisų pelningumas</h1>
        <Link
          className="hidden rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition hover:opacity-90 lg:inline-block"
          href="/trips/new"
        >
          + Naujas reisas
        </Link>
      </div>

      <section aria-labelledby="overview-heading" className="mt-6">
        <h2 id="overview-heading" className="sr-only">Apžvalga</h2>
        <Dashboard />
      </section>
    </main>
  );
}
