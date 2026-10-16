import Link from "next/link";
import { Plus } from "lucide-react";

import { Dashboard } from "./dashboard";
import { buttonPrimary, Page, PageHeader } from "./ui";

export default function Home() {
  // Meniu ir rėmas gyvena maketo lygyje (`app/app-shell.tsx`), todėl puslapis
  // rūpinasi tik savo turiniu (#145).
  return (
    <Page>
      <PageHeader
        title="Suvestinė"
        actions={<Link className={`${buttonPrimary} hidden lg:inline-flex`} href="/trips/new"><Plus aria-hidden className="size-4" strokeWidth={2} />Naujas reisas</Link>}
      />

      <section aria-labelledby="overview-heading" className="mt-5">
        <h2 id="overview-heading" className="sr-only">Apžvalga</h2>
        <Dashboard />
      </section>
    </Page>
  );
}
