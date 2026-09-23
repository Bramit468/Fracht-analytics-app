"use server";

import {
  firstPlace,
  routeEstimate,
  routeFill,
  suggestedDays,
  PTV_GEOCODING_URL,
  PTV_ROUTING_URL,
  PTV_TRUCK_PROFILE,
  type RouteFill,
} from "@/lib/ptv-route";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export type RouteLookupResult =
  | {
      ok: true;
      fill: RouteFill;
      km: number;
      tollCents: number;
      days: number;
      /** Ką PTV suprato iš adresų – kad matytųsi, jei suprato ne tai. */
      fromAddress: string;
      toAddress: string;
      /** Bent vienas adresas rastas tik iki miesto, ne iki namo. */
      approximate: boolean;
      /** PTV nerado vilkikui tinkamo kelio arba jis pažeidžia ribojimus. */
      violated: boolean;
    }
  | { ok: false; message: string };

async function ptvJson(url: string, key: string): Promise<unknown> {
  const response = await fetch(url, { headers: { apiKey: key }, cache: "no-store" });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

async function geocode(query: string, key: string) {
  const url = `${PTV_GEOCODING_URL}?searchText=${encodeURIComponent(query)}`;
  return firstPlace(await ptvJson(url, key));
}

/**
 * Adresai -> vilkiko maršrutas -> kilometrai ir kelių mokesčiai (#61).
 *
 * Užklausa eina iš serverio, nes `PTV_API_KEY` į naršyklę patekti negali.
 * Prisijungimas tikrinamas ir čia: server action pasiekiama adresu, ne tik
 * per mygtuką.
 */
export async function lookupRoute(
  origin: string,
  destination: string,
): Promise<RouteLookupResult> {
  const key = process.env.PTV_API_KEY;
  if (!key) {
    return { ok: false, message: "Maršrutų skaičiavimas neįjungtas." };
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return { ok: false, message: "Prisijunkite iš naujo." };
  }

  if (!origin.trim() || !destination.trim()) {
    return { ok: false, message: "Užpildykite laukus „Iš“ ir „Į“." };
  }

  try {
    const [from, to] = await Promise.all([
      geocode(origin, key),
      geocode(destination, key),
    ]);

    if (!from) return { ok: false, message: `Nepavyko rasti adreso „${origin}“.` };
    if (!to) return { ok: false, message: `Nepavyko rasti adreso „${destination}“.` };

    const url =
      `${PTV_ROUTING_URL}?waypoints=${from.latitude},${from.longitude}` +
      `&waypoints=${to.latitude},${to.longitude}` +
      `&profile=${PTV_TRUCK_PROFILE}&results=TOLL_COSTS`;

    const estimate = routeEstimate(await ptvJson(url, key));
    if (!estimate) {
      return { ok: false, message: "Nepavyko suskaičiuoti maršruto." };
    }

    return {
      ok: true,
      fill: routeFill(estimate),
      km: estimate.km,
      tollCents: estimate.tollCents,
      days: suggestedDays(estimate.travelHours),
      fromAddress: from.formattedAddress,
      toAddress: to.formattedAddress,
      approximate: from.locationType !== "EXACT_ADDRESS" || to.locationType !== "EXACT_ADDRESS",
      violated: estimate.violated,
    };
  } catch {
    return { ok: false, message: "Nepavyko susisiekti su maršrutų paslauga." };
  }
}
