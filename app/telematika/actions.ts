"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { dailyArchiveRows, supplyArchiveRows } from "@/lib/telematics-archive";

export interface ArchiveState {
  status: "idle" | "error" | "success";
  message?: string;
}

/** Vienu įrašymu siunčiamų eilučių riba, kad užklausa neišaugtų per didelė. */
const PORCIJA = 500;

async function fetchJson(url: string | undefined): Promise<unknown> {
  if (!url) throw new Error("Nenurodytas adresas");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

/**
 * Nusirašo telematikos duomenis į savo lenteles (#54).
 *
 * Paleidžia žmogus, ne tvarkaraštis. Taip archyvavimas vyksta su prisijungusio
 * vartotojo teisėmis: `company_id` užsipildo pagal jį, o RLS galioja kaip
 * visur. Automatiniam paleidimui reikėtų `service_role` rakto, kuris apeina
 * visą RLS — to neverta įsivesti dėl darbo, kurį kol kas atlieka mygtukas.
 *
 * Įrašoma `upsert` pagal raktą, todėl paleisti galima kiek nori kartų:
 * pasikartojanti eilutė perrašoma, o ne dubliuojama.
 */
// Parametrų neima sąmoningai: `useActionState` perduoda ankstesnę būseną ir
// formos duomenis, bet archyvavimui nereikia nei vieno — ką siųsti, nusprendžia
// tiekėjo atsakymas, o ne vartotojo įvestis.
export async function archiveTelematics(): Promise<ArchiveState> {
  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims?.claims) {
    return { status: "error", message: "Prisijungimo sesija baigėsi. Prisijunkite dar kartą." };
  }

  let daily, supplies;
  try {
    const [canRaw, suppliesRaw] = await Promise.all([
      fetchJson(process.env.TELEMATIKA_CANDAILY_URL),
      fetchJson(process.env.TELEMATIKA_SUPPLIES_URL),
    ]);
    daily = dailyArchiveRows(canRaw);
    supplies = supplyArchiveRows(suppliesRaw);
  } catch {
    return { status: "error", message: "Nepavyko gauti telematikos duomenų." };
  }

  for (let i = 0; i < daily.length; i += PORCIJA) {
    const { error } = await supabase
      .from("telematics_daily")
      .upsert(daily.slice(i, i + PORCIJA), { onConflict: "company_id,plate,date" });
    if (error) {
      console.error("Nepavyko archyvuoti paros eilučių", error);
      return { status: "error", message: "Nepavyko įrašyti paros duomenų. Ar pritaikyta migracija 0008?" };
    }
  }

  for (let i = 0; i < supplies.length; i += PORCIJA) {
    const { error } = await supabase
      .from("telematics_supplies")
      .upsert(supplies.slice(i, i + PORCIJA), { onConflict: "company_id,item_id" });
    if (error) {
      console.error("Nepavyko archyvuoti pirkimų", error);
      return { status: "error", message: "Nepavyko įrašyti pirkimų. Ar pritaikyta migracija 0008?" };
    }
  }

  return {
    status: "success",
    message: `Archyvuota: ${daily.length} paros eilučių, ${supplies.length} pirkimų.`,
  };
}
