import { Suspense } from "react";
import { TripForm } from "../../new/trip-form";
import { TripVarianceSection } from "./variance";

export default async function EditTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <main className="px-4 py-8"><div className="mx-auto max-w-4xl">
    <h1 className="my-6 text-3xl font-semibold">Reiso taisymas</h1>
    <div className="rounded-2xl border bg-surface p-6 shadow-sm"><TripForm tripId={id} routeLookup={Boolean(process.env.PTV_API_KEY)} /></div>
    {/* Telematikos užklausa lėta, o forma nuo jos nepriklauso – tegul nelaukia. */}
    <Suspense fallback={null}><TripVarianceSection tripId={id} /></Suspense>
  </div></main>;
}
