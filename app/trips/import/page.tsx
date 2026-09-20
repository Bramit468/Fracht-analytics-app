import Link from "next/link";
import { ExcelImport } from "./excel-import";

export default function ImportTripsPage() {
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
    <div className="mx-auto max-w-6xl">
      <Link href="/" className="text-sm underline">Back to dashboard</Link>
      <div className="mt-4">
        <h1 className="text-3xl font-semibold">Import trips from Excel</h1>
        <p className="mt-2 text-slate-600">Upload an .xlsx file, match its columns, review the rows, and import valid trips.</p>
      </div>
      <div className="mt-6 rounded-2xl border bg-white p-6 shadow-sm"><ExcelImport /></div>
    </div>
  </main>;
}
