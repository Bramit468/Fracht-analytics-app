"use client";

import { useActionState } from "react";

import { authenticate, type AuthFormState } from "./actions";

const INITIAL_STATE: AuthFormState = { status: "idle" };

const inputClass =
  "mt-1.5 block w-full rounded-md border border-line-strong bg-surface px-3 py-2 outline-none transition-colors placeholder:text-muted/60 focus:border-ink";

export function LoginForm() {
  const [state, action, pending] = useActionState(authenticate, INITIAL_STATE);

  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm font-medium text-ink">
        El. paštas
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className={inputClass}
          placeholder="vardas@imone.lt"
        />
      </label>
      <label className="block text-sm font-medium text-ink">
        Slaptažodis
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={6}
          required
          className={inputClass}
        />
      </label>

      {state.message && (
        <p
          role="status"
          className={`rounded-md px-3 py-2 text-sm ${
            state.status === "error" ? "bg-bad-soft text-bad" : "bg-accent-soft text-good"
          }`}
        >
          {state.message}
        </p>
      )}

      <button
        disabled={pending}
        className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Jungiamasi…" : "Prisijungti"}
      </button>
    </form>
  );
}
