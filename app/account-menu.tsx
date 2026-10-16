"use client";

import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getSupabaseClient } from "@/lib/supabase";

/**
 * Kas prisijungęs ir mygtukas atsijungti.
 *
 * Gyvena meniu apačioje (kompiuteryje) arba antraštėje (telefone), o ne
 * plaukiojančioje kortelėje, kuri uždengdavo lentelių paskutines eilutes.
 */
export function AccountMenu({ variant }: { variant: "sidebar" | "header" }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const client = getSupabaseClient();
    let active = true;

    void client.auth.getClaims().then(async ({ data }) => {
      const claimEmail = data?.claims?.email;
      if (active && typeof claimEmail === "string") setEmail(claimEmail);

      if (data?.claims) {
        const { data: company } = await client
          .from("companies")
          .select("name")
          .limit(1)
          .maybeSingle();
        if (active) setCompanyName(company?.name ?? null);
      }
    });

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (active) setEmail(session?.user.email ?? null);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (!email) return null;

  async function signOut() {
    setBusy(true);
    await getSupabaseClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (variant === "header") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={signOut}
        title={email}
        className="text-sm font-medium text-muted hover:text-ink disabled:opacity-50"
      >
        {busy ? "Atsijungiama…" : "Atsijungti"}
      </button>
    );
  }

  return (
    <div className="mt-4 flex items-center gap-2 border-t border-white/[0.08] px-2.5 pt-4">
      <div className="min-w-0 flex-1">
        {companyName && <p className="truncate text-sm font-medium text-sidebar-ink">{companyName}</p>}
        <p className="truncate text-xs text-sidebar-muted">{email}</p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={signOut}
        aria-label="Atsijungti"
        title="Atsijungti"
        className="grid size-7 shrink-0 place-items-center rounded-md text-sidebar-muted hover:bg-white/[0.06] hover:text-sidebar-ink disabled:opacity-50"
      >
        <LogOut aria-hidden className="size-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}
