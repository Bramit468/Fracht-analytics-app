import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseClient: SupabaseClient | undefined;

/**
 * Returns the browser-safe Supabase client used by the application.
 *
 * Configuration is read lazily so builds can run without production secrets.
 * The public anon key is still protected by Supabase Row Level Security rules.
 */
export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  supabaseClient = createClient(url, anonKey);

  return supabaseClient;
}
