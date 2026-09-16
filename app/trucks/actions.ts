"use server";

import { refresh } from "next/cache";

import { getSupabaseClient } from "@/lib/supabase";
import {
  parseTruckForm,
  readTruckFormValues,
  type TruckFormErrors,
  type TruckFormValues,
} from "@/lib/truck";

export interface CreateTruckState {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: TruckFormErrors;
  /** Įvestos reikšmės grąžinamos, kad klaidos atveju forma neišsivalytų. */
  values?: TruckFormValues;
}

/** Postgres klaidos kodas, kai pažeidžiamas `unique` apribojimas. */
const UNIQUE_VIOLATION = "23505";

// Prisijungimo dar nėra (Auth bus atskira užduotis). Kai atsiras, čia reikės
// patikrinti vartotoją ir jo įmonę — Server Action pasiekiamas tiesiogiai POST
// užklausa, ne tik per formą.
export async function createTruck(
  _previous: CreateTruckState,
  formData: FormData,
): Promise<CreateTruckState> {
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

  const { error } = await getSupabaseClient().from("trucks").insert(parsed.value);

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

  refresh();

  return { status: "success", message: `Fura ${parsed.value.plate} pridėta.` };
}
