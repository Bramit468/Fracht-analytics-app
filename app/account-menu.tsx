"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getSupabaseClient } from "@/lib/supabase";

export function AccountMenu() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const client = getSupabaseClient();
    let active = true;

    void client.auth.getClaims().then(({ data }) => {
      const claimEmail = data?.claims?.email;
      if (active && typeof claimEmail === "string") setEmail(claimEmail);
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

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 text-sm shadow-lg backdrop-blur">
      <span className="max-w-40 truncate text-slate-500">{email}</span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await getSupabaseClient().auth.signOut();
          router.replace("/login");
          router.refresh();
        }}
        className="font-semibold text-slate-800 underline disabled:opacity-50"
      >
        {busy ? "Atsijungiama…" : "Atsijungti"}
      </button>
    </div>
  );
}
