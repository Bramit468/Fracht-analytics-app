"use server";

import { refresh } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  parseTruckForm,
  readTruckFormValues,
  type TruckFormErrors,
  type TruckFormValues,
} from "@/lib/truck";
import {
  parseBulkCosts,
  readBulkCostValues,
  type BulkCostValues,
} from "@/lib/truck-costs-bulk";
import { parseBulkWeights, readBulkWeightValues } from "@/lib/truck-weights-bulk";
import type { Truck } from "@/types/truck";

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

export interface SaveTruckCostsState {
  status: "idle" | "error" | "success";
  message?: string;
  /** Klaidos pagal furos `id`. */
  errors?: Record<string, TruckFormErrors>;
  /** Įvestos reikšmės grąžinamos, kad klaidos atveju lentelė neišsivalytų. */
  values?: BulkCostValues;
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
 * Išsaugo visų furų paros kaštus vienu kartu (#99).
 *
 * Esamos reikšmės imamos iš duomenų bazės, o ne iš formos: taip matyti, kurios
 * eilutės iš tikrųjų pasikeitė, ir nepaliestos furos lieka nepaliestos net tada,
 * kai kas nors jas pakeitė kitame lange.
 */
export async function saveTruckCosts(
  _previous: SaveTruckCostsState,
  formData: FormData,
): Promise<SaveTruckCostsState> {
  const supabase = await createServerSupabaseClient();
  const { data: trucks, error: readError } = await supabase
    .from("trucks")
    .select("*")
    .order("plate")
    .overrideTypes<Truck[], { merge: false }>();

  if (readError) {
    console.error("Nepavyko nuskaityti furų prieš įrašymą", readError);
    return { status: "error", message: "Nepavyko nuskaityti furų. Bandykite dar kartą." };
  }

  const values = readBulkCostValues(formData, trucks);
  const { updates, errors } = parseBulkCosts(values, trucks);

  if (Object.keys(errors).length > 0) {
    return {
      status: "error",
      message: "Patikrinkite pažymėtus laukus. Kitos furos neišsaugotos.",
      errors,
      values,
    };
  }

  if (updates.length === 0) {
    return { status: "success", message: "Pakeitimų nebuvo." };
  }

  const results = await Promise.all(
    updates.map(async (update) => ({
      plate: update.plate,
      error: (await supabase.from("trucks").update(update.value).eq("id", update.id)).error,
    })),
  );

  const failed = results.filter((result) => result.error !== null);

  if (failed.length > 0) {
    for (const result of failed) {
      console.error(`Nepavyko įrašyti furos ${result.plate} kaštų`, result.error);
    }

    refresh();

    return {
      status: "error",
      message: `Nepavyko įrašyti šių furų: ${failed.map((result) => result.plate).join(", ")}.`,
      values,
    };
  }

  refresh();

  return {
    status: "success",
    message: `Išsaugota furų: ${updates.length}.`,
  };
}

/**
 * Išsaugo visų furų svorius vienu kartu (#121).
 *
 * Tie patys principai kaip kaštų lentelėje: esamos reikšmės imamos iš duomenų
 * bazės, įrašomos tik pasikeitusios eilutės, o klaida vienoje eilutėje nesustabdo
 * kitų.
 */
export async function saveTruckWeights(
  _previous: SaveTruckCostsState,
  formData: FormData,
): Promise<SaveTruckCostsState> {
  const supabase = await createServerSupabaseClient();
  const { data: trucks, error: readError } = await supabase
    .from("trucks")
    .select("*")
    .order("plate")
    .overrideTypes<Truck[], { merge: false }>();

  if (readError) {
    console.error("Nepavyko nuskaityti furų prieš svorių įrašymą", readError);
    return { status: "error", message: "Nepavyko nuskaityti furų. Bandykite dar kartą." };
  }

  const values = readBulkWeightValues(formData, trucks);
  const { updates, errors } = parseBulkWeights(values, trucks);

  if (Object.keys(errors).length > 0) {
    return {
      status: "error",
      message: "Patikrinkite pažymėtus laukus. Kitos furos neišsaugotos.",
      errors,
      values,
    };
  }

  if (updates.length === 0) {
    return { status: "success", message: "Pakeitimų nebuvo." };
  }

  const results = await Promise.all(
    updates.map(async (update) => ({
      plate: update.plate,
      error: (await supabase.from("trucks").update(update.value).eq("id", update.id)).error,
    })),
  );

  const failed = results.filter((result) => result.error !== null);

  if (failed.length > 0) {
    for (const result of failed) {
      console.error(`Nepavyko įrašyti furos ${result.plate} svorių`, result.error);
    }

    refresh();

    return {
      status: "error",
      message: `Nepavyko įrašyti šių furų: ${failed.map((result) => result.plate).join(", ")}.`,
      values,
    };
  }

  refresh();

  return { status: "success", message: `Išsaugota furų: ${updates.length}.` };
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
