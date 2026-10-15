import type { Metadata } from "next";

import { DedicatedOffers } from "./dedicated-offers";

export const metadata: Metadata = {
  title: "Dedikuoti | Bramit",
};

export default function DedicatedPage() {
  return <main className="px-4 py-8">
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl font-semibold">Dedikuoti pasiūlymai</h1>
      <p className="mt-1 text-sm text-muted">
        Fura su vairuotoju vienam užsakovui visą mėnesį. Fura kainuoja visą mėnesį, net jei užsakovas
        jos neapkrovė – todėl svarbiausia matyti, kiek km reikia, kad kaina padengtų kaštus.
      </p>
      <div className="mt-6"><DedicatedOffers /></div>
    </div>
  </main>;
}
