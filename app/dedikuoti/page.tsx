import type { Metadata } from "next";

import { Page, PageHeader } from "../ui";
import { DedicatedOffers } from "./dedicated-offers";

export const metadata: Metadata = {
  title: "Dedikuoti | Bramit",
};

export default function DedicatedPage() {
  return <Page>
    <PageHeader
      title="Dedikuoti pasiūlymai"
      description="Fura su vairuotoju vienam užsakovui visą mėnesį. Fura kainuoja visą mėnesį, net jei užsakovas jos neapkrovė – todėl svarbiausia matyti, kiek km reikia, kad kaina padengtų kaštus."
    />
    <div className="mt-5"><DedicatedOffers /></div>
  </Page>;
}
