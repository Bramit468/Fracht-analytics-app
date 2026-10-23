"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { activeNavHref, NAV_GROUP_LABELS, NAV_ITEMS, type NavGroup } from "@/lib/navigation";

import { AccountMenu } from "./account-menu";
import { AppNav } from "./app-nav";
import { AssistantChat } from "./assistant-chat";
import { BrandMark } from "./brand-mark";
import { NAV_ICONS } from "./nav-icons";

/** Puslapiai be meniu: iki prisijungimo jo nėra kur vesti. */
const BARE_PATHS = ["/login", "/auth"];

const GROUPS: NavGroup[] = ["darbas", "duomenys", "nustatymai"];

/**
 * Vienas rėmas visai programai (#145, #205).
 *
 * Meniu gyvena maketo lygyje: kompiuteryje visada kairėje, telefone – viršuje.
 * Aktyvus punktas pažymimas plona žalia juostele ir šviesesniu fonu, o ne
 * užpildytu mygtuku – meniu yra navigacija, ne veiksmas.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = activeNavHref(pathname);

  if (BARE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-page text-ink lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      {/* Meniu lieka ekrane slenkant: `sticky` ir savas slinkimas, jei skilčių
          netilptų į žemą langą (#149). */}
      <aside className="hidden flex-col bg-sidebar px-3 py-5 lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-y-auto">
        <Link href="/" className="flex items-center gap-2.5 px-2.5">
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-tight text-sidebar-ink">Bramit</span>
        </Link>

        <nav aria-label="Pagrindinis meniu" className="mt-8 flex flex-1 flex-col gap-6">
          {GROUPS.map((group) => (
            <div key={group} className={group === "nustatymai" ? "mt-auto" : undefined}>
              {NAV_GROUP_LABELS[group] && (
                <p className="mb-1.5 px-2.5 text-xs font-medium text-sidebar-muted/70">{NAV_GROUP_LABELS[group]}</p>
              )}
              <ul className="space-y-0.5">
                {NAV_ITEMS.filter((item) => item.group === group).map((item) => {
                  const Icon = NAV_ICONS[item.href];
                  const current = item.href === active;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={current ? "page" : undefined}
                        className={`relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                          current
                            ? "bg-white/[0.07] text-sidebar-ink before:absolute before:inset-y-1.5 before:-left-3 before:w-[3px] before:rounded-r before:bg-brand"
                            : "text-sidebar-muted hover:bg-white/[0.04] hover:text-sidebar-ink"
                        }`}
                      >
                        {Icon && <Icon aria-hidden className={`size-4 shrink-0 ${current ? "text-brand" : ""}`} strokeWidth={1.75} />}
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <AccountMenu variant="sidebar" />
      </aside>

      <div className="min-w-0">
        {/* Telefone meniu juosta viršuje – tos pačios skiltys ta pačia tvarka,
            taip pat prilipusi prie ekrano viršaus. */}
        <header className="sticky top-0 z-30 border-b border-line bg-surface px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2">
              <BrandMark className="size-6" />
              <span className="text-[15px] font-semibold tracking-tight">Bramit</span>
            </Link>
            <div className="flex items-center gap-4">
              <AccountMenu variant="header" />
              <Link
                href="/trips/new"
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink"
              >
                Naujas reisas
              </Link>
            </div>
          </div>
          <AppNav className="mt-3" />
        </header>

        {children}
      </div>
      <AssistantChat />
    </div>
  );
}
