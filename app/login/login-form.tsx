"use client";

import { useActionState } from "react";

import { authenticate, type AuthFormState } from "./actions";

const INITIAL_STATE: AuthFormState = { status: "idle" };

export function LoginForm() {
  const [state, action, pending] = useActionState(authenticate, INITIAL_STATE);

  return (
    <form action={action} className="space-y-5">
      <label className="block text-sm font-medium text-ink">
        El. paštas
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-2 block w-full rounded-xl border border-line bg-raised px-4 py-3 outline-none transition focus:border-accent"
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
          className="mt-2 block w-full rounded-xl border border-line bg-raised px-4 py-3 outline-none transition focus:border-accent"
        />
      </label>

      {state.message && (
        <p
          role="status"
          className={`rounded-xl px-4 py-3 text-sm ${
            state.status === "error"
              ? "bg-bad-soft text-bad"
              : "bg-accent-soft text-good"
          }`}
        >
          {state.message}
        </p>
      )}

      <div>
        <button
          disabled={pending}
          className="w-full rounded-xl bg-accent px-4 py-3 font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Prašome palaukti…" : "Prisijungti"}
        </button>
      </div>
      <p className="text-center text-xs leading-5 text-muted">
        Prieigą prie įmonės darbo erdvės suteikia administratorius.
      </p>
    </form>
  );
}
