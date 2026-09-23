"use client";

import { useActionState } from "react";

import { archiveTelematics, type ArchiveState } from "./actions";

const INITIAL_STATE: ArchiveState = { status: "idle" };

/** Nusirašo tiekėjo duomenis į archyvą, kol jie dar yra jo lange (#54). */
export function ArchiveButton() {
  const [state, formAction, pending] = useActionState(archiveTelematics, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-neutral-700"
      >
        {pending ? "Archyvuojama…" : "Išsaugoti į archyvą"}
      </button>
      {state.message && (
        <p
          role="status"
          className={
            state.status === "error" ? "text-sm text-red-600" : "text-sm text-green-700"
          }
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
