import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { parseSnapshots, type TelematicsSnapshot } from "@/lib/telematics";

export const metadata: Metadata = {
  title: "Telematika | Fracht Analytics",
};

/** Objektai, nesisiekę ilgiau nei parą, nerodomi: sąraše lieka ir seni vilkikai. */
const SVIEZUMAS_VAL = 24;

function freshSince(): string {
  const riba = new Date(Date.now() - SVIEZUMAS_VAL * 3600 * 1000);
  return riba.toISOString().slice(0, 19).replace("T", " ");
}

async function loadAndStore(): Promise<{ snapshots: TelematicsSnapshot[]; error?: string }> {
  const url = process.env.TELEMATIKA_SNAPSHOT_URL;
  if (!url) {
    return { snapshots: [], error: "Nenurodytas TELEMATIKA_SNAPSHOT_URL." };
  }

  let snapshots: TelematicsSnapshot[];
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    snapshots = parseSnapshots(await response.json(), freshSince());
  } catch {
    return { snapshots: [], error: "Nepavyko gauti telematikos duomenų." };
  }

  // Kiekvienas apsilankymas palieka nuotrauką. Ta pati akimirka antrą kartą
  // neįrašoma, todėl stovinti fura vietos neužima.
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("telematics_snapshots").upsert(
    snapshots.map((s) => ({
      object_id: s.objectId, plate: s.plate, gps_time: s.gpsTime,
      country: s.country, ignition: s.ignition,
      odometer_km: s.odometerKm, fuel_l: s.fuelL,
    })),
    { onConflict: "company_id,object_id,gps_time", ignoreDuplicates: true },
  );

  if (error) {
    console.error("Nepavyko įrašyti telematikos nuotraukų", error);
    return { snapshots, error: "Duomenys gauti, bet neišsaugoti. Ar pritaikyta migracija 0008?" };
  }

  return { snapshots };
}

export default async function TelematikaPage() {
  // Duomenys momentiniai, todėl puslapis generuojamas kiekvienai užklausai.
  await connection();

  const { snapshots, error } = await loadAndStore();
  const vaziuoja = snapshots.filter((s) => s.ignition).length;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-1">
        <Link href="/" className="text-sm underline">Atgal į suvestinę</Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Telematika</h1>
        <p className="text-sm text-neutral-500">
          {error ?? `${snapshots.length} vilkikai, iš jų ${vaziuoja} su įjungtu degimu. Kiekvienas apsilankymas išsaugo nuotrauką.`}
        </p>
      </header>

      {snapshots.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="border-b">
            <tr>
              <th className="py-2 pr-4 font-medium">Numeris</th>
              <th className="py-2 pr-4 font-medium">Šalis</th>
              <th className="py-2 pr-4 font-medium">Degimas</th>
              <th className="py-2 pr-4 text-right font-medium">Rida, km</th>
              <th className="py-2 font-medium">Paskutinis signalas</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((s) => (
              <tr key={`${s.objectId}-${s.gpsTime}`} className="border-b last:border-0">
                <td className="py-2 pr-4 font-medium">{s.plate}</td>
                <td className="py-2 pr-4">{s.country ?? "—"}</td>
                <td className="py-2 pr-4">{s.ignition ? "įjungtas" : "išjungtas"}</td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {s.odometerKm === null ? "—" : s.odometerKm.toLocaleString("lt-LT")}
                </td>
                <td className="py-2 tabular-nums">{s.gpsTime}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
