"use client";

import Link from "next/link";
import { useEffect } from "react";

import { buttonPrimary, buttonSecondary, Page } from "./ui";

/**
 * Serverio ar puslapio klaida: vietoj Next.js numatyto ekrano – paaiškinimas ir
 * „Bandyti dar kartą“. Meniu lieka (klaida tik puslapio viduje), todėl galima ir išeiti.
 */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <Page>
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold">Kažkas nepavyko</h1>
      <p className="mt-2 text-sm text-muted">Puslapio nepavyko parodyti. Patikrinkite ryšį ir bandykite dar kartą.</p>
      {error.digest && <p className="mt-1 font-mono text-xs text-muted">Klaidos kodas: {error.digest}</p>}
      <div className="mt-6 flex justify-center gap-2">
        <button type="button" onClick={() => retry()} className={buttonPrimary}>Bandyti dar kartą</button>
        <Link href="/" className={buttonSecondary}>Į Suvestinę</Link>
      </div>
    </div>
  </Page>;
}
