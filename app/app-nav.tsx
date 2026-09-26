"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { activeNavHref, NAV_ITEMS } from "@/lib/navigation";

/**
 * Vienas meniu visuose puslapiuose (#135).
 *
 * Anksčiau meniu buvo tik suvestinėje, o kiti puslapiai turėjo po nuorodą
 * „Atgal“. Dėl to iš furų sąrašo į reisus buvo galima patekti tik per
 * suvestinę, o pačių furų meniu nebuvo visai.
 */
export function AppNav({ className = "" }: { className?: string }) {
  const active = activeNavHref(usePathname());

  return (
    <nav aria-label="Pagrindinis meniu" className={`flex gap-2 overflow-x-auto pb-1 ${className}`}>
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.href === active ? "page" : undefined}
          className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition ${
            item.href === active
              ? "bg-slate-950 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
