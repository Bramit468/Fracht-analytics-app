"use client";

import { useActionState } from "react";

import { inviteMember, type InviteState } from "./actions";

const INITIAL_STATE: InviteState = { status: "idle" };

/** Pakvietimo forma: vienas laukas, nes daugiau nieko ir nereikia (#97). */
export function InviteForm() {
  const [state, formAction, pending] = useActionState(inviteMember, INITIAL_STATE);
  const error = state.status === "error";

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <label className="flex flex-col gap-1 text-sm">
        <span>Darbuotojo el. paštas</span>
        <input
          name="email"
          type="email"
          autoComplete="off"
          placeholder="vardas@imone.lt"
          defaultValue={state.email ?? ""}
          aria-invalid={error ? true : undefined}
          aria-describedby={state.message ? "invite-message" : undefined}
          className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 aria-invalid:border-red-600 dark:border-neutral-700"
        />
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Įrašoma…" : "Pakviesti"}
        </button>
        {state.message && (
          <p
            id="invite-message"
            role="status"
            className={error ? "text-sm text-red-600" : "text-sm text-green-700"}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
