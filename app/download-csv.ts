"use client";

import { CSV_BOM } from "@/lib/csv";

/**
 * Atsiunčia paruoštą CSV tekstą (#133).
 *
 * Laikoma atskirai nuo turinio kūrimo: tekstą surenka grynos `lib` funkcijos su
 * testais, o čia lieka vien naršyklės veiksmas, kurio testu vis tiek
 * nepatikrintum.
 */
export function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob([CSV_BOM, csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(url);
}

/** Šiandiena failo varde. */
export function todayForFileName(): string {
  return new Date().toISOString().slice(0, 10);
}
