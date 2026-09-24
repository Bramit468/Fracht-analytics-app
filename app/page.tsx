import Link from "next/link";
import { Dashboard } from "./dashboard";

const navigation = [
  { href: "/", label: "Suvestinė", active: true },
  { href: "/trips", label: "Reisai" },
  { href: "/trips/new", label: "Naujas reisas" },
  { href: "/trips/import", label: "Importas iš Excel" },
  { href: "/telematika", label: "Faktiniai kaštai" },
  { href: "/imone", label: "Įmonė" },
];

function BrandMark() {
  return <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-blue-500 text-lg font-black text-white shadow-lg shadow-blue-950/30">F</span>;
}

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-950 lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden min-h-screen flex-col bg-slate-950 px-4 py-6 text-slate-300 lg:flex">
        <Link href="/" className="flex items-center gap-3 px-2">
          <BrandMark />
          <span><strong className="block text-sm text-white">Fracht Analytics</strong><span className="text-xs text-slate-500">Reisų analitika</span></span>
        </Link>
        <nav aria-label="Pagrindinis meniu" className="mt-10 space-y-1">
          {navigation.map((item) => <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined} className={`block rounded-xl px-4 py-3 text-sm font-semibold transition ${item.active ? "bg-blue-600 text-white shadow-lg shadow-blue-950/20" : "hover:bg-slate-900 hover:text-white"}`}>{item.label}</Link>)}
        </nav>
        <div className="mt-auto rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-emerald-400"><span className="size-2 rounded-full bg-emerald-400" /> Gyvi duomenys</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">Duomenys imami iš Supabase ir atnaujinami iš išsaugotų reisų.</p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6 lg:px-8 xl:px-10">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3 lg:hidden"><BrandMark /><span className="text-sm font-bold">Fracht Analytics</span></Link>
            <div className="hidden lg:block"><p className="text-sm font-medium text-slate-500">Veiklos apžvalga</p><p className="text-xs text-slate-400">Visi išsaugoti reisai</p></div>
            <Link className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700" href="/trips/new">+ Naujas reisas</Link>
          </div>
          <nav aria-label="Meniu telefone" className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {navigation.map((item) => <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${item.active ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>{item.label}</Link>)}
          </nav>
        </header>

        <div className="w-full px-4 py-7 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Suvestinė</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Reisų pelningumas</h1><p className="mt-2 text-slate-500">Pajamos, kaštai ir reisai, į kuriuos verta atkreipti dėmesį.</p></div>
            <div className="flex gap-3">
              <Link className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50" href="/trips/import">Importas iš Excel</Link>
              <Link className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50" href="/trips/vyksta">Vyksta dabar</Link>
              <Link className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50" href="/trips">Visi reisai</Link>
            </div>
          </div>
          <section aria-labelledby="overview-heading" className="mt-8">
            <h2 id="overview-heading" className="sr-only">Apžvalga</h2>
            <Dashboard />
          </section>
        </div>
      </div>
    </main>
  );
}
