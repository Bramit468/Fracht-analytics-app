import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Telematikos nuorodos yra vienos įmonės (env kintamieji), todėl kitų įmonių
 * naudotojai jos matyti negali (#S2). Be `TELEMATIKA_COMPANY_ID` neleidžiama niekam.
 */
export function isTelematicsCompany(companyId: unknown, allowed: string | undefined): boolean {
  const expected = allowed?.trim().toLowerCase();
  return Boolean(expected) && typeof companyId === "string" && companyId.toLowerCase() === expected;
}

/** Ar prisijungusio naudotojo įmonė gali naudotis telematika. */
export async function canUseTelematics(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.rpc("current_user_company_id");
  return isTelematicsCompany(data, process.env.TELEMATIKA_COMPANY_ID);
}
