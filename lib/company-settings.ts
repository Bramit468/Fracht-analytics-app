import type { SupabaseClient } from "@supabase/supabase-js";

export interface CompanySettings {
  /** Minimali marža (#181). `null` – riba nenustatyta. */
  minMarginPercent: number | null;
  /** Kiek dienpinigių normos moka įmonė (#187). `null` – pagal šalis neskaičiuojama. */
  perDiemPercent: number | null;
  /** Kiek įnašas turi viršyti alternatyvą, kad krovinį verta imti (0023). `null` – 0. */
  minContributionCents: number | null;
}

/** PostgREST `numeric` gali grąžinti ir tekstu. */
function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Įmonės nustatymai. Imama `*`, o ne stulpelių sąrašas: kol atitinkama
 * migracija (0013, 0016) nepaleista, stulpelio nėra, ir nustatymas tiesiog
 * `null` – programa elgiasi kaip anksčiau.
 *
 * Įmonės eilutė matoma tik viena – sava (RLS), todėl filtro nereikia.
 */
export async function fetchCompanySettings(client: SupabaseClient): Promise<CompanySettings> {
  const { data, error } = await client.from("companies").select("*").maybeSingle();
  if (error) {
    console.error("Nepavyko nuskaityti įmonės nustatymų", error);
    return { minMarginPercent: null, perDiemPercent: null, minContributionCents: null };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    minMarginPercent: numberOrNull(row.min_margin_percent),
    perDiemPercent: numberOrNull(row.per_diem_percent),
    minContributionCents: numberOrNull(row.min_contribution_cents),
  };
}

export async function fetchMinMarginPercent(client: SupabaseClient): Promise<number | null> {
  return (await fetchCompanySettings(client)).minMarginPercent;
}
