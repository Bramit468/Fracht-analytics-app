"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { readSheet } from "read-excel-file/browser";
import { getSupabaseClient } from "../../../lib/supabase";
import {
  buildImportPreview,
  importFields,
  missingRequiredMappings,
  suggestColumnMapping,
  type ColumnMapping,
  type ExcelCell,
  type InvalidImportRow,
} from "../../../lib/excel-import";
import { saveTrip } from "../../../lib/trips";
import type { CountryTariff } from "../../../lib/calc";
import type { Truck } from "../../../types/truck";

const inputClass = "mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3";

function headerText(cell: unknown, index: number): string {
  if (cell === null || cell instanceof Date || !String(cell).trim()) return `Column ${index + 1}`;
  return String(cell).trim();
}

export function ExcelImport() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [tariffs, setTariffs] = useState<CountryTariff[]>([]);
  const [loadingReference, setLoadingReference] = useState(true);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ExcelCell[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ imported: number; failed: InvalidImportRow[] } | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function loadReferenceData() {
      try {
        const client = getSupabaseClient();
        const [trucksResult, tariffsResult] = await Promise.all([
          client.from("trucks").select("*").order("plate"),
          client.from("country_tariffs").select("country,rate,rate_type").order("country"),
        ]);
        const referenceError = trucksResult.error ?? tariffsResult.error;
        if (referenceError) throw referenceError;
        if (!cancelled) {
          setTrucks((trucksResult.data ?? []) as Truck[]);
          setTariffs((tariffsResult.data ?? []).map((tariff) => ({
            country: tariff.country,
            rate: Number(tariff.rate),
            rateType: tariff.rate_type,
          })));
        }
      } catch {
        if (!cancelled) setError("Nepavyko užkrauti furų ir kelių įkainių.");
      } finally {
        if (!cancelled) setLoadingReference(false);
      }
    }
    void loadReferenceData();
    return () => { cancelled = true; };
  }, []);

  const missingMappings = mapping ? missingRequiredMappings(mapping) : [];
  const preview = useMemo(() => {
    if (!mapping || missingMappings.length) return { validRows: [], invalidRows: [] };
    return buildImportPreview(rows, mapping, trucks, tariffs);
  }, [mapping, missingMappings.length, rows, tariffs, trucks]);

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setResult(null);
    setHeaders([]);
    setRows([]);
    setMapping(null);
    setFileName(file.name);
    try {
      const sheet = await readSheet(file);
      if (sheet.length < 2) throw new Error("Faile turi būti antraščių eilutė ir bent vienas reisas.");
      const nextHeaders = sheet[0].map(headerText);
      setHeaders(nextHeaders);
      setRows(sheet.slice(1) as unknown as ExcelCell[][]);
      setMapping(suggestColumnMapping(nextHeaders));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nepavyko perskaityti šio .xlsx failo.");
    }
  }

  async function importTrips() {
    if (busy.current || !preview.validRows.length) return;
    busy.current = true;
    setImporting(true);
    setError("");
    setProgress(0);
    const failed = [...preview.invalidRows];
    let imported = 0;

    for (const row of preview.validRows) {
      try {
        await saveTrip(row.trip, row.legs);
        imported += 1;
      } catch (cause) {
        failed.push({
          sourceRow: row.sourceRow,
          tripNumber: row.trip.trip_number,
          reason: cause instanceof Error ? cause.message : "Duomenų bazė atmetė šią eilutę.",
        });
      }
      setProgress(imported + failed.length - preview.invalidRows.length);
    }

    setResult({ imported, failed });
    setImporting(false);
    busy.current = false;
  }

  if (loadingReference) return <p role="status">Kraunamos furos ir kelių įkainiai…</p>;
  if (!trucks.length || !tariffs.length) return <p role="alert" className="text-red-700">{error || "Pirma įveskite furas ir kelių įkainius."}</p>;

  return <div className="space-y-8">
    <section>
      <h2 className="text-lg font-semibold">1. Upload Excel</h2>
      <p className="mt-1 text-sm text-slate-600">Naudojamas pirmas lapas ir jo pirma eilutė. Pajamos importuojamos kaip frachto kaina.</p>
      <label className="mt-4 inline-flex cursor-pointer rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">
        Choose .xlsx file
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={selectFile} disabled={importing} />
      </label>
      {fileName && <p className="mt-2 text-sm text-slate-600">Selected: {fileName}</p>}
      {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
    </section>

    {mapping && <section>
      <h2 className="text-lg font-semibold">2. Match columns</h2>
      <p className="mt-1 text-sm text-slate-600">Privalomi laukai pažymėti *. Nepriskirti neprivalomi laukai bus 0, viena para ir įkainis „Nemokami“.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {importFields.map((field) => <label key={field.key} className="text-sm font-medium">
          {field.label}{field.required ? " *" : ""}
          <select className={inputClass} value={mapping[field.key] ?? ""} disabled={importing || !!result} onChange={(event) => {
            const column = event.target.value === "" ? null : Number(event.target.value);
            setMapping((current) => current ? { ...current, [field.key]: column } : current);
          }}>
            <option value="">Nepriskirta</option>
            {headers.map((header, index) => <option key={`${header}-${index}`} value={index}>{header}</option>)}
          </select>
        </label>)}
      </div>
      {!!missingMappings.length && <p role="alert" className="mt-4 text-red-700">Map required fields: {missingMappings.join(", ")}.</p>}
    </section>}

    {mapping && !missingMappings.length && <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">3. Review and import</h2>
          <p className="mt-1 text-sm text-slate-600">{preview.validRows.length} valid · {preview.invalidRows.length} skipped</p>
        </div>
        <button type="button" onClick={importTrips} disabled={importing || !!result || !preview.validRows.length} className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50">
          {importing ? `Importing ${progress}/${preview.validRows.length}…` : `Import ${preview.validRows.length} trips`}
        </button>
      </div>
      <div className="mt-4 max-h-96 overflow-auto rounded-xl border">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="sticky top-0 bg-slate-100"><tr><th className="p-3">Excel eilutė</th><th className="p-3">Reisas</th><th className="p-3">Maršrutas</th><th className="p-3">Būsena</th></tr></thead>
          <tbody>
            {preview.validRows.map((row) => <tr key={`valid-${row.sourceRow}`} className="border-t"><td className="p-3">{row.sourceRow}</td><td className="p-3">{row.trip.trip_number}</td><td className="p-3">{row.trip.origin} → {row.trip.destination}</td><td className="p-3 font-medium text-emerald-700">Tinka</td></tr>)}
            {preview.invalidRows.map((row) => <tr key={`invalid-${row.sourceRow}`} className="border-t bg-red-50"><td className="p-3">{row.sourceRow}</td><td className="p-3">{row.tripNumber}</td><td className="p-3">—</td><td className="p-3 text-red-700">{row.reason}</td></tr>)}
          </tbody>
        </table>
      </div>
    </section>}

    {result && <section role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
      <h2 className="font-semibold text-emerald-900">Importas baigtas</h2>
      <p className="mt-1 text-emerald-900">{result.imported} trips imported. {result.failed.length} rows skipped.</p>
      <div className="mt-4 flex gap-4"><Link href="/trips" className="font-semibold underline">Rodyti reisus</Link><Link href="/" className="font-semibold underline">Rodyti suvestinę</Link></div>
      {!!result.failed.length && <ul className="mt-4 list-disc pl-5 text-sm text-red-800">{result.failed.map((row) => <li key={`${row.sourceRow}-${row.tripNumber}`}>Row {row.sourceRow} ({row.tripNumber}): {row.reason}</li>)}</ul>}
    </section>}
  </div>;
}
