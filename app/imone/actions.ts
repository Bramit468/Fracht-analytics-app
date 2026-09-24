"use server";

import { refresh } from "next/cache";

import {
  isAlreadyMember,
  normalizeEmail,
  parseInviteEmail,
  type CompanyMember,
} from "@/lib/invitations";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export interface InviteState {
  status: "idle" | "error" | "success";
  message?: string;
  /** Įvesta reikšmė grąžinama, kad klaidos atveju laukas neišsivalytų. */
  email?: string;
}

/** Postgres klaidos kodas, kai pažeidžiamas `unique` apribojimas. */
const UNIQUE_VIOLATION = "23505";

function readEmail(formData: FormData): string {
  const raw = formData.get("email");
  return typeof raw === "string" ? raw : "";
}

/**
 * Pakviečia darbuotoją į savo įmonę (#97).
 *
 * Nieko nesiunčiame: pakvietimas tiesiog laukia lentelėje, o suveikia tada, kai
 * tuo adresu kas nors užsiregistruoja. Kvietimą į kurią įmonę rašyti, sprendžia
 * `company_id` numatytoji reikšmė, o ar leidžiama — RLS.
 */
export async function inviteMember(
  _previous: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const typed = readEmail(formData);
  const parsed = parseInviteEmail(typed);

  if (!parsed.ok) {
    return { status: "error", message: parsed.error, email: typed };
  }

  const supabase = await createServerSupabaseClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    return {
      status: "error",
      message: "Prisijungimo sesija baigėsi. Prisijunkite dar kartą.",
      email: typed,
    };
  }

  const { data: members } = await supabase
    .from("company_member_emails")
    .select("user_id,email,role,created_at")
    .overrideTypes<CompanyMember[], { merge: false }>();

  if (isAlreadyMember(members ?? [], parsed.email)) {
    return {
      status: "error",
      message: `${parsed.email} jau turi prieigą prie įmonės duomenų.`,
      email: typed,
    };
  }

  const { error } = await supabase
    .from("company_invitations")
    .insert({ email: parsed.email });

  if (error?.code === UNIQUE_VIOLATION) {
    return describeDuplicate(supabase, parsed.email, typed);
  }

  if (error) {
    console.error("Nepavyko įrašyti pakvietimo", error);
    return {
      status: "error",
      message: "Nepavyko įrašyti pakvietimo. Bandykite dar kartą.",
      email: typed,
    };
  }

  refresh();

  return {
    status: "success",
    message: `${parsed.email} pakviestas. Prieigą gaus užsiregistravęs tuo adresu.`,
  };
}

/**
 * Paaiškina, kodėl adresas nebetelpa.
 *
 * Tas pats `23505` reiškia arba pakvietimą, kuris jau laukia mūsų įmonėje, arba
 * pakvietimą kitoje įmonėje. Skirtumą matyti tik pažiūrėjus, ar eilutė mums
 * apskritai matoma: svetimos RLS neparodo.
 */
async function describeDuplicate(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  email: string,
  typed: string,
): Promise<InviteState> {
  const { data } = await supabase
    .from("company_invitations")
    .select("email")
    .eq("email", email)
    .is("accepted_at", null);

  return {
    status: "error",
    message:
      (data?.length ?? 0) > 0
        ? `${email} jau pakviestas ir laukia registracijos.`
        : `${email} jau pakviestas į kitą įmonę.`,
    email: typed,
  };
}

/** Atšaukia dar nepriimtą pakvietimą (#97). */
export async function cancelInvitation(
  _previous: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const email = normalizeEmail(readEmail(formData));

  if (email === "") {
    return { status: "error", message: "Nenurodyta, kurį pakvietimą atšaukti." };
  }

  const supabase = await createServerSupabaseClient();

  // `is("accepted_at", null)` saugo nuo priimto pakvietimo trynimo: jį ištrynus
  // dingtų istorija, o prieigos žmogus vis tiek nebeprarastų — narystė jau
  // įrašyta atskirai.
  const { data, error } = await supabase
    .from("company_invitations")
    .delete()
    .eq("email", email)
    .is("accepted_at", null)
    .select("email");

  if (error) {
    console.error("Nepavyko atšaukti pakvietimo", error);
    return { status: "error", message: "Nepavyko atšaukti pakvietimo. Bandykite dar kartą." };
  }

  if (data.length === 0) {
    return { status: "error", message: "Pakvietimas nerastas. Galbūt jis jau priimtas." };
  }

  refresh();

  return { status: "idle" };
}
