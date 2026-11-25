"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { canUseTelematics } from "@/lib/telematics-access";
import { writeArchive } from "@/lib/telematics-archive-store";
import { fetchTelematics } from "@/lib/telematics-feed";

export interface ArchiveState {
  status: "idle" | "error" | "success";
  message?: string;
}

/**
 * Nusirašo telematikos duomenis į savo lenteles (#54).
 *
 * Paleidžia žmogus, ne tvarkaraštis. Taip archyvavimas vyksta su prisijungusio
 * vartotojo teisėmis: `company_id` užsipildo pagal jį, o RLS galioja kaip
 * visur. Automatiniam paleidimui reikėtų `service_role` rakto, kuris apeina
 * visą RLS – to neverta įsivesti dėl darbo, kurį kol kas atlieka mygtukas.
 *
 * Įrašoma `upsert` pagal raktą, todėl paleisti galima kiek nori kartų:
 * pasikartojanti eilutė perrašoma, o ne dubliuojama.
 */
// Parametrų neima sąmoningai: `useActionState` perduoda ankstesnę būseną ir
// formos duomenis, bet archyvavimui nereikia nei vieno – ką siųsti, nusprendžia
// tiekėjo atsakymas, o ne vartotojo įvestis.
export async function archiveTelematics(): Promise<ArchiveState> {
  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims?.claims) {
    return { status: "error", message: "Prisijungimo sesija baigėsi. Prisijunkite dar kartą." };
  }

  if (!(await canUseTelematics(supabase))) {
    return { status: "error", message: "Telematika šiai įmonei neprijungta." };
  }

  let feeds;
  try {
    const [canDaily, supplies, orders, trips] = await Promise.all([
      fetchTelematics("canDaily"),
      fetchTelematics("supplies"),
      // Užsakymai ir kelionės – ne visada prijungti; be jų archyvas vis tiek veikia.
      fetchTelematics("orders").catch(() => null),
      fetchTelematics("trips").catch(() => null),
    ]);
    feeds = { canDaily, supplies, orders, trips };
  } catch {
    return { status: "error", message: "Nepavyko gauti telematikos duomenų." };
  }

  let saved;
  try {
    saved = await writeArchive(supabase, feeds);
  } catch {
    return { status: "error", message: "Nepavyko gauti telematikos duomenų." };
  }
  if (saved.error) return { status: "error", message: saved.error };

  return {
    status: "success",
    message: `Archyvuota: ${saved.dailyRows} paros eilučių, ${saved.supplyRows} pirkimų`
      + (saved.rawSaved > 0 ? `, ${saved.rawSaved} užsakymų ir kelionių eilučių.` : ".")
      + (saved.rawMissing ? " Užsakymams reikia migracijos 0028." : ""),
  };
}
