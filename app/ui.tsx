import type { ReactNode } from "react";

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

/** Puslapio rėmas: vienodos paraštės visur, plotis – pagal turinį. */
export function Page({ children, width = "wide" }: { children: ReactNode; width?: "wide" | "narrow" }) {
  return (
    <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <div className={width === "narrow" ? "max-w-4xl" : "max-w-[1400px]"}>{children}</div>
    </main>
  );
}
