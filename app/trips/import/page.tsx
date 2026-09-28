import { ExcelImport } from "./excel-import";

export default function ImportTripsPage() {
  return <main className="px-4 py-8">
    <div className="mx-auto max-w-6xl">
      <div className="mt-6">
        <h1 className="text-3xl font-semibold">Reisų importas iš Excel</h1>
        <p className="mt-2 text-muted">Įkelkite .xlsx failą, priskirkite stulpelius, peržiūrėkite eilutes ir importuokite tinkamus reisus.</p>
      </div>
      <div className="mt-6 rounded-2xl border border-line bg-surface p-6"><ExcelImport /></div>
    </div>
  </main>;
}
