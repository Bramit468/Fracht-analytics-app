"use client";

import { useActionState } from "react";

import { cancelInvitation, type InviteState } from "./actions";

const INITIAL_STATE: InviteState = { status: "idle" };

/** Vieno laukiančio pakvietimo atšaukimas (#97). */
export function InvitationRowActions({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(cancelInvitation, INITIAL_STATE);

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <input type="hidden" name="email" value={email} />
        <button
          type="submit"
          disabled={pending}
          className="text-red-600 underline disabled:opacity-50"
        >
          {pending ? "Atšaukiama…" : "Atšaukti"}
        </button>
      </form>
      {state.message && (
        <p role="alert" className="text-xs text-red-600">
          {state.message}
        </p>
      )}
    </div>
  );
}
