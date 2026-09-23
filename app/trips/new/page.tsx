import Link from "next/link";
import { TripForm } from "./trip-form";

export default function NewTripPage() {
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950"><div className="mx-auto max-w-4xl">
    <Link href="/" className="text-sm underline">Atgal į suvestinę</Link>
    <h1 className="my-6 text-3xl font-semibold">Naujas reisas</h1>
    {/* Be PTV rakto mygtukas nerodomas – forma veikia kaip iki #61. */}
    <div className="rounded-2xl border bg-white p-6 shadow-sm"><TripForm routeLookup={Boolean(process.env.PTV_API_KEY)} /></div>
  </div></main>;
}
