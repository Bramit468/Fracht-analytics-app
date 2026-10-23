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
    <nav aria-label="Pagrindinis meniu" className={`-mx-1 flex gap-1 overflow-x-auto pb-1 ${className}`}>
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.href === active ? "page" : undefined}
          className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
            item.href === active
              ? "bg-accent-soft text-ink"
              : "text-muted hover:text-ink"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
