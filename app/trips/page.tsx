import Link from "next/link";
import { Plus } from "lucide-react";

import { buttonPrimary, buttonSecondary, Page, PageHeader } from "../ui";
import { TripList } from "./trip-list";

export default function TripsPage() {
  return <Page>
    <PageHeader
      title="Reisai"
      actions={<>
        <Link href="/trips/import" className={buttonSecondary}>Importas iš Excel</Link>
        <Link href="/trips/new" className={buttonPrimary}><Plus aria-hidden className="size-4" strokeWidth={2} />Naujas reisas</Link>
      </>}
    />
    <div className="mt-5"><TripList /></div>
  </Page>;
}
