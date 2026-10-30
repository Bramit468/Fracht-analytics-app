import Link from "next/link";

import { buttonPrimary, Page } from "./ui";

/** Neegzistuojantis adresas: lietuviškai ir su keliu atgal, ne angliškas Next.js ekranas. */
export default function NotFound() {
  return <Page>
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold">Puslapis nerastas</h1>
      <p className="mt-2 text-sm text-muted">Tokio adreso nėra arba reisas jau ištrintas.</p>
      <Link href="/" className={`${buttonPrimary} mt-6`}>Į Suvestinę</Link>
    </div>
  </Page>;
}
