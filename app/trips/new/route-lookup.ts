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

/** PTV atsakymo klaida su kodu — kad žinutė galėtų pasakyti, kas negerai. */
class PtvError extends Error {
  constructor(readonly status: number, readonly body: string) {
    super(`PTV ${status}`);
  }
}

async function ptvJson(url: string, key: string): Promise<unknown> {
  const response = await fetch(url, { headers: { apiKey: key }, cache: "no-store" });
  if (!response.ok) {
    // Kūnas nuskaitomas iki galo: PTV jame paaiškina, kas negerai, o be to
    // liktų tik „nepavyko", ir kita klaida vėl būtų aklas spėjimas.
    throw new PtvError(response.status, (await response.text()).slice(0, 500));
  }
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
  // Įklijuojant į Vercel lengvai prilimpa tarpas ar eilutės pabaiga, o PTV
  // tada atmeta raktą kaip neteisingą.
  const key = process.env.PTV_API_KEY?.trim();
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
  } catch (cause) {
    if (cause instanceof PtvError) {
      console.error("PTV atmetė užklausą", cause.status, cause.body);

      if (cause.status === 401 || cause.status === 403) {
        return {
          ok: false,
          message: "Maršrutų paslauga nepriėmė rakto. Patikrinkite PTV_API_KEY reikšmę Vercel’yje – dažniausiai įsivelia tarpas arba eilutės pabaiga.",
        };
      }
      if (cause.status === 429) {
        return { ok: false, message: "Viršytas maršrutų užklausų limitas. Bandykite vėliau." };
      }
      return { ok: false, message: `Maršrutų paslauga grąžino klaidą ${cause.status}.` };
    }

    console.error("Nepavyko pasiekti PTV", cause);
    return { ok: false, message: "Nepavyko susisiekti su maršrutų paslauga." };
  }
}
