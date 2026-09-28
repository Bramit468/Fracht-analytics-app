"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { activeNavHref, NAV_ITEMS } from "@/lib/navigation";

import { AppNav } from "./app-nav";

/** Puslapiai be meniu: iki prisijungimo jo nėra kur vesti. */
const BARE_PATHS = ["/login", "/auth"];

function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="grid size-10 place-items-center rounded-xl bg-accent text-lg font-black text-accent-ink"
    >
      F
    </span>
  );
}

/**
 * Vienas rėmas visai programai (#145).
 *
 * Meniu buvo tik suvestinėje kairėje, o kituose puslapiuose – juosta viršuje,
 * todėl einant per skiltis jis šokinėjo iš vietos į vietą. Dabar jis gyvena
 * maketo lygyje: kompiuteryje visada kairėje, telefone – viršuje, ir puslapis
 * nebeturi savo meniu kopijos.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = activeNavHref(pathname);

  if (BARE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-page text-ink lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden min-h-screen flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
        <Link href="/" className="flex items-center gap-3 px-2">
          <BrandMark />
          <span>
            <strong className="block text-sm text-ink">Fracht Analytics</strong>
            <span className="text-xs text-muted">Reisų analitika</span>
          </span>
        </Link>

        <nav aria-label="Pagrindinis meniu" className="mt-10 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.href === active ? "page" : undefined}
              className={`block rounded-xl px-4 py-3 text-sm font-semibold transition ${
                item.href === active
                  ? "bg-accent text-accent-ink"
                  : "text-muted hover:bg-raised hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="min-w-0">
        {/* Telefone meniu juosta viršuje – tos pačios skiltys ta pačia tvarka. */}
        <header className="border-b border-line bg-surface px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3">
              <BrandMark />
              <span className="text-sm font-bold">Fracht Analytics</span>
            </Link>
            <Link
              href="/trips/new"
              className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-accent-ink"
            >
              + Reisas
            </Link>
          </div>
          <AppNav className="mt-3" />
        </header>

        {children}
      </div>
    </div>
  );
}
