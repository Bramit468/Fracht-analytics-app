import Link from "next/link";

import { NAV_ITEMS } from "@/lib/navigation";

import { AppNav } from "./app-nav";
import { Dashboard } from "./dashboard";

function BrandMark() {
  return <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-accent text-lg font-black text-accent-ink">F</span>;
}

export default function Home() {
  return (
    <main className="min-h-screen bg-page text-ink lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden min-h-screen flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
        <Link href="/" className="flex items-center gap-3 px-2">
          <BrandMark />
          <span><strong className="block text-sm text-ink">Fracht Analytics</strong><span className="text-xs text-muted">Reisų analitika</span></span>
        </Link>
        {/* Šoninis meniu rodomas tik suvestinėje, todėl pažymėtas punktas
            žinomas iš anksto ir `usePathname` čia nereikalingas (#135). */}
        <nav aria-label="Pagrindinis meniu" className="mt-10 space-y-1">
          {NAV_ITEMS.map((item) => <Link key={item.href} href={item.href} aria-current={item.href === "/" ? "page" : undefined} className={`block rounded-xl px-4 py-3 text-sm font-semibold transition ${item.href === "/" ? "bg-accent text-accent-ink" : "text-muted hover:bg-raised hover:text-ink"}`}>{item.label}</Link>)}
        </nav>
      </aside>

      <div className="min-w-0">
        <header className="border-b border-line bg-surface px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3 lg:hidden"><BrandMark /><span className="text-sm font-bold">Fracht Analytics</span></Link>
            <h1 className="hidden text-lg font-semibold lg:block">Reisų pelningumas</h1>
            <Link className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition hover:opacity-90" href="/trips/new">+ Naujas reisas</Link>
          </div>
          {/* Telefone meniu juosta; kompiuteryje jį atstoja šoninis. */}
          <AppNav className="mt-4 lg:hidden" />
        </header>

        <div className="w-full px-4 py-7 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold tracking-tight lg:sr-only">Reisų pelningumas</h1>
          <section aria-labelledby="overview-heading" className="mt-6 lg:mt-0">
            <h2 id="overview-heading" className="sr-only">Apžvalga</h2>
            <Dashboard />
          </section>
        </div>
      </div>
    </main>
  );
}
