"use server";

import { refresh } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  parseTruckForm,
  readTruckFormValues,
  type TruckFormErrors,
  type TruckFormValues,
} from "@/lib/truck";

export interface SaveTruckState {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: TruckFormErrors;
  /** Įvestos reikšmės grąžinamos, kad klaidos atveju forma neišsivalytų. */
  values?: TruckFormValues;
}

export interface DeleteTruckState {
  status: "idle" | "error";
  message?: string;
}

/** Postgres klaidos kodas, kai pažeidžiamas `unique` apribojimas. */
const UNIQUE_VIOLATION = "23505";

/** Postgres klaidos kodas, kai eilutė dar naudojama per išorinį raktą. */
const FOREIGN_KEY_VIOLATION = "23503";

/** Formos `id` laukas: tuščias — nauja fura, užpildytas — taisoma esama. */
function readTruckId(formData: FormData): string | null {
  const raw = formData.get("id");
  return typeof raw === "string" && raw !== "" ? raw : null;
}

/**
 * Su `id` atnaujina esamą furą, be jo — įrašo naują (#39).
 *
 * Kurią furą leidžiama liesti, sprendžia RLS (`trucks_company_access`), todėl
 * svetimas `id` nepadės — tokiu atveju nepaliečiama nė viena eilutė.
 */
export async function saveTruck(
  _previous: SaveTruckState,
  formData: FormData,
): Promise<SaveTruckState> {
  const truckId = readTruckId(formData);
  const values = readTruckFormValues(formData);
  const parsed = parseTruckForm(values);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Patikrinkite pažymėtus laukus.",
      errors: parsed.errors,
      values,
    };
  }

  const supabase = await createServerSupabaseClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    return {
      status: "error",
      message: "Prisijungimo sesija baigėsi. Prisijunkite dar kartą.",
      values,
    };
  }

  // `select` grąžina paliestas eilutes: taip matyti, ar taisoma fura apskritai
  // pasiekiama, o ne tik ar užklausa nenulūžo.
  const { data, error } = truckId
    ? await supabase.from("trucks").update(parsed.value).eq("id", truckId).select("id")
    : await supabase.from("trucks").insert(parsed.value).select("id");

  if (error?.code === UNIQUE_VIOLATION) {
    return {
      status: "error",
      message: "Patikrinkite pažymėtus laukus.",
      errors: { plate: `Fura ${parsed.value.plate} jau yra sąraše.` },
      values,
    };
  }

  if (error) {
    console.error("Nepavyko įrašyti furos", error);
    return {
      status: "error",
      message: "Nepavyko įrašyti furos. Bandykite dar kartą.",
      values,
    };
  }

  if (data.length === 0) {
    return {
      status: "error",
      message: "Fura nerasta. Galbūt ji ištrinta.",
      values,
    };
  }

  refresh();

  return {
    status: "success",
    message: truckId
      ? `Furos ${parsed.value.plate} pakeitimai išsaugoti.`
      : `Fura ${parsed.value.plate} pridėta.`,
  };
}

/**
 * Ištrina furą (#39).
 *
 * Naudojamos furos ištrinti neleidžia `trips` išorinis raktas (`on delete
 * restrict`) — Postgres grąžina 23503, ir tai parodoma žmogiškai.
 */
export async function deleteTruck(
  _previous: DeleteTruckState,
  formData: FormData,
): Promise<DeleteTruckState> {
  const truckId = readTruckId(formData);

  if (!truckId) {
    return { status: "error", message: "Nenurodyta, kurią furą ištrinti." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("trucks")
    .delete()
    .eq("id", truckId)
    .select("id");

  if (error?.code === FOREIGN_KEY_VIOLATION) {
    return {
      status: "error",
      message: "Fura naudojama reisuose, todėl neištrinama.",
    };
  }

  if (error) {
    console.error("Nepavyko ištrinti furos", error);
    return { status: "error", message: "Nepavyko ištrinti furos. Bandykite dar kartą." };
  }

  if (data.length === 0) {
    return { status: "error", message: "Fura nerasta. Galbūt ji jau ištrinta." };
  }

  refresh();

  return { status: "idle" };
}
