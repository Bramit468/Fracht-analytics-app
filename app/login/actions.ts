"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase-server";

export interface AuthFormState {
  status: "idle" | "error" | "success";
  message?: string;
}

function readCredentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email.includes("@") || password.length < 6) {
    return null;
  }

  return { email, password };
}

export async function authenticate(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const credentials = readCredentials(formData);
  if (!credentials) {
    return {
      status: "error",
      message: "Įveskite galiojantį el. paštą ir bent 6 simbolių slaptažodį.",
    };
  }

  try {
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase.auth.signInWithPassword(credentials);
    if (error) {
      return {
        status: "error",
        message: "Neteisingas el. paštas arba slaptažodis.",
      };
    }
  } catch {
    return {
      status: "error",
      message: "Nepavyko prisijungti prie autentifikacijos paslaugos.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/");
}
