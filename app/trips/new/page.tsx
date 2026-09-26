import Link from "next/link";
import { TripForm } from "./trip-form";

export default async function NewTripPage({
  searchParams,
}: {
  searchParams: Promise<{ copy?: string }>;
}) {
  // `?copy=<id>` užpildo formą pagal esamą reisą, bet numerio ir datos
  // neperkelia — jie kiekvienam reisui savi (#129).
  const { copy } = await searchParams;

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950"><div className="mx-auto max-w-4xl">
    <Link href="/" className="text-sm underline">Atgal į suvestinę</Link>
    <h1 className="my-6 text-3xl font-semibold">{copy ? "Naujas reisas pagal ankstesnį" : "Naujas reisas"}</h1>
    {copy && <p className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
      Laukai užpildyti iš pasirinkto reiso. Reiso numerį įrašykite naują, o datą patikrinkite.
    </p>}
    {/* Be PTV rakto mygtukas nerodomas – forma veikia kaip iki #61. */}
    <div className="rounded-2xl border bg-white p-6 shadow-sm"><TripForm copyFromId={copy} routeLookup={Boolean(process.env.PTV_API_KEY)} /></div>
  </div></main>;
}
