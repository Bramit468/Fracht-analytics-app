"use client";

import { useState } from "react";

import { applyOldTrips, previewOldTrips, type OldTripsResult } from "./old-trips";

/**
 * Vienkartinis senų reisų pataisymas: atkarpų nebeturime, todėl pagal paros
 * ridą atimami tik savaitgaliai, kai fura stovėjo. Pirma parodoma, kas pasikeis.
 */
export function OldTripsFix() {
  const [preview, setPreview] = useState<OldTripsResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setBusy(true);
    setMessage("");
    try { setPreview(await previewOldTrips()); } catch { setPreview({ ok: false, message: "Nepavyko. Patikrinkite ryšį ir bandykite dar kartą." }); } finally { setBusy(false); }
  }

  async function apply() {
    setBusy(true);
    try {
      const result = await applyOldTrips();
      setMessage(result.message);
      if (result.ok) setPreview(null);
    } catch { setMessage("Nepavyko. Patikrinkite ryšį ir bandykite dar kartą."); } finally { setBusy(false); }
  }

  return <div className="space-y-3 text-sm">
    <p className="text-muted">
      Reisams, kurių Telematikos atkarpų nebeturime nei sraute, nei archyve, tikslus perskaičiavimas neįmanomas. Jiems iš parų
      atimami tik šeštadieniai ir sekmadieniai, kai fura stovėjo (paros rida mažiau nei 50 km). Tušti km, kuras ir keliai lieka.
      Ranka taisyti reisai ir jau pataisyti – neliečiami.
    </p>
    {!preview?.ok && <button type="button" disabled={busy} onClick={() => void load()} className="rounded-md border border-line-strong px-3.5 py-2 font-medium hover:bg-page disabled:opacity-50">
      {busy ? "Skaičiuojama…" : "Peržiūrėti, kas pasikeis"}
    </button>}
    {preview && !preview.ok && <p role="alert" className="text-bad">{preview.message}</p>}
    {preview?.ok && <>
      <p>
        Pasikeis reisų: <strong>{preview.changes.length}</strong>
        {preview.skippedByHand > 0 && <span className="text-muted"> · praleista taisytų ranka: {preview.skippedByHand}</span>}
      </p>
      {preview.changes.length > 0 && <div className="max-h-80 overflow-auto rounded-md border border-line">
        <table className="w-full">
          <thead><tr className="border-b border-line text-left text-xs text-muted">
            <th className="px-3 py-2 font-medium">Data</th><th className="px-3 py-2 font-medium">Reisas</th><th className="px-3 py-2 font-medium">Fura</th>
            <th className="px-3 py-2 text-right font-medium">Paros</th><th className="px-3 py-2 font-medium">Išmetama</th>
          </tr></thead>
          <tbody className="divide-y divide-line">{preview.changes.map((change) => <tr key={change.id}>
            <td className="px-3 py-1.5 tabular-nums">{change.tripDate}</td>
            <td className="px-3 py-1.5">{change.tripNumber}</td>
            <td className="px-3 py-1.5 font-mono">{change.plate}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{change.daysBefore} → {change.daysAfter}</td>
            <td className="px-3 py-1.5 tabular-nums text-muted">{change.dates.join(", ")}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      <div className="flex gap-3">
        {preview.changes.length > 0 && <button type="button" disabled={busy} onClick={() => void apply()} className="rounded-md bg-accent px-3.5 py-2 font-medium text-accent-ink disabled:opacity-50">
          {busy ? "Įrašoma…" : `Įrašyti ${preview.changes.length} pakeitimus`}
        </button>}
        <button type="button" disabled={busy} onClick={() => setPreview(null)} className="rounded-md border border-line-strong px-3.5 py-2 hover:bg-page">Atšaukti</button>
      </div>
    </>}
    {message && <p role="status" className={message.startsWith("Pataisyta") ? "text-good" : "text-bad"}>{message}</p>}
  </div>;
}
