import Link from "next/link";
import { ExcelImport } from "./excel-import";

export default function ImportTripsPage() {
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
    <div className="mx-auto max-w-6xl">
      <Link href="/" className="text-sm underline">Atgal į suvestinę</Link>
      <div className="mt-4">
        <h1 className="text-3xl font-semibold">Reisų importas iš Excel</h1>
        <p className="mt-2 text-slate-600">Įkelkite .xlsx failą, priskirkite stulpelius, peržiūrėkite eilutes ir importuokite tinkamus reisus.</p>
      </div>
      <div className="mt-6 rounded-2xl border bg-white p-6 shadow-sm"><ExcelImport /></div>
    </div>
  </main>;
}
