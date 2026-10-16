import { Suspense } from "react";
import { Page, PageHeader } from "../../../ui";
import { TripForm } from "../../new/trip-form";
import { TripVarianceSection } from "./variance";

export default async function EditTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <Page>
    <PageHeader title="Reiso taisymas" />
    <div className="mt-5 rounded-lg border border-line bg-surface p-5 sm:p-6"><TripForm tripId={id} routeLookup={Boolean(process.env.PTV_API_KEY)} /></div>
    {/* Telematikos užklausa lėta, o forma nuo jos nepriklauso – tegul nelaukia. */}
    <Suspense fallback={null}><TripVarianceSection tripId={id} /></Suspense>
  </Page>;
}
