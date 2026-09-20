"use client";

import { useActionState } from "react";

import { authenticate, type AuthFormState } from "./actions";

const INITIAL_STATE: AuthFormState = { status: "idle" };

export function LoginForm() {
  const [state, action, pending] = useActionState(authenticate, INITIAL_STATE);

  return (
    <form action={action} className="space-y-5">
      <label className="block text-sm font-medium text-slate-700">
        El. paštas
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-2 block w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          placeholder="vardas@imone.lt"
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Slaptažodis
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={6}
          required
          className="mt-2 block w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        />
      </label>

      {state.message && (
        <p
          role="status"
          className={`rounded-xl px-4 py-3 text-sm ${
            state.status === "error"
              ? "bg-red-50 text-red-700"
              : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {state.message}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          name="intent"
          value="login"
          disabled={pending}
          className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Prašome palaukti…" : "Prisijungti"}
        </button>
        <button
          name="intent"
          value="signup"
          disabled={pending}
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          Sukurti paskyrą
        </button>
      </div>
    </form>
  );
}
