import Link from "next/link";
import type { ReactNode } from "react";

import type { SkippedTrip } from "../lib/trips";

/**
 * Bendri puslapio elementai (#205).
 *
 * Kiekvienas puslapis anksčiau turėjo savo antraštės dydį, plotį ir mygtukų
 * apvalinimą – iš to ir matėsi, kad sudėliota po vieną. Dabar visi ima iš čia.
 */

export const buttonPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink transition-colors hover:bg-accent/90 disabled:opacity-50";

export const buttonSecondary =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-line-strong bg-surface px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-page disabled:opacity-50";

export const input =
  "rounded-md border border-line-strong bg-surface px-3 py-2 text-sm placeholder:text-muted/70 focus:border-ink focus:outline-none";

export function PageHeader({ title, description, actions }: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Puslapio rėmas: vienodos paraštės ir visas ekrano plotis. Siauras stulpelis
 * plačiame ekrane palikdavo pusę lango tuščio – turinys pats išsidėlioja
 * stulpeliais, kai vietos daugiau.
 */
export function Page({ children }: { children: ReactNode }) {
  return <main className="w-full px-4 py-6 sm:px-6 lg:px-8">{children}</main>;
}

/**
 * Nustatymo eilutė: kairėje pavadinimas ir paaiškinimas, dešinėje laukai –
 * plačiame ekrane tekstas neišsitempia per visą eilutę.
 */
export function SettingRow({ title, description, children }: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 border-b border-line py-6 last:border-b-0 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-10">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <div className="mt-1 text-sm text-muted">{description}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** Reisai, kurių nepavyko suskaičiuoti: jie neįtraukti, bet ir nedingsta tyliai. */
export function SkippedTripsNotice({ skipped }: { skipped: SkippedTrip[] }) {
  if (!skipped.length) return null;
  return <details className="rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
    <summary className="cursor-pointer">Neįtraukta {skipped.length} reis.: jų nepavyko suskaičiuoti. Pataisykite juos.</summary>
    <ul className="mt-2 space-y-1">{skipped.map((trip) => <li key={trip.id}>
      <Link href={`/trips/${trip.id}/edit`} className="underline">{trip.tripNumber}</Link> – {trip.reason}
    </li>)}</ul>
  </details>;
}
