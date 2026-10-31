import type { Metadata } from "next";

import { Page, PageHeader } from "../ui";
import { QuoteLog } from "./quote-log";

export const metadata: Metadata = {
  title: "Pasiūlymai | Bramit",
};

export default function QuotesPage() {
  return <Page>
    <PageHeader
      title="Pasiūlymai"
      description="Kiekviena reiso formoje suskaičiuota kaina: ką sakė Bramit, ką nusprendėte ir kuo baigėsi."
    />
    <div className="mt-5"><QuoteLog /></div>
  </Page>;
}
