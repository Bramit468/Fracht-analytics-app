import type { SupabaseClient } from "@supabase/supabase-js";

import { isMissingColumnError } from "./truck";

/**
 * Įmonės minimali marža (#181). `null` – riba nenustatyta arba migracija 0013
 * dar nepaleista: tada programa elgiasi kaip anksčiau, be įspėjimų.
 *
 * Įmonės eilutė matoma tik viena – sava (RLS), todėl filtro nereikia.
 */
export async function fetchMinMarginPercent(client: SupabaseClient): Promise<number | null> {
  const { data, error } = await client.from("companies").select("min_margin_percent").maybeSingle();
  if (error) {
    if (!isMissingColumnError(error)) console.error("Nepavyko nuskaityti minimalios maržos", error);
    return null;
  }
  const value = (data as { min_margin_percent: number | string | null } | null)?.min_margin_percent;
  // PostgREST `numeric` gali grąžinti ir tekstu.
  return value === null || value === undefined ? null : Number(value);
}
