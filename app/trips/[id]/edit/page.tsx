import Link from "next/link";
import { TripForm } from "../../new/trip-form";

export default async function EditTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950"><div className="mx-auto max-w-4xl">
    <Link href="/trips" className="text-sm underline">Atgal į reisus</Link>
    <h1 className="my-6 text-3xl font-semibold">Reiso taisymas</h1>
    <div className="rounded-2xl border bg-white p-6 shadow-sm"><TripForm tripId={id} /></div>
  </div></main>;
}
