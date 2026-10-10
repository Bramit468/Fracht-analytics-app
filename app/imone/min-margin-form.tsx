"use client";

import { useActionState } from "react";

import { saveMinMargin, type MinMarginState } from "./actions";

const INITIAL_STATE: MinMarginState = { status: "idle" };

/** Įmonės minimali marža (#181). Tuščias laukas – riba panaikinama. */
export function MinMarginForm({ current }: { current: number | null }) {
  const [state, formAction, pending] = useActionState(saveMinMargin, INITIAL_STATE);
  const error = state.status === "error";
  const shown = current === null ? "" : String(current).replace(".", ",");

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <label className="flex flex-col gap-1 text-sm">
        <span>Minimali marža, %</span>
        <input
          name="min_margin_percent"
          type="text"
          inputMode="decimal"
          placeholder="pvz. 12"
          defaultValue={state.value ?? shown}
          aria-invalid={error ? true : undefined}
          aria-describedby={state.message ? "min-margin-message" : undefined}
          className="w-40 rounded-md border border-line bg-transparent px-3 py-2 aria-invalid:border-bad"
        />
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-50"
        >
          {pending ? "Įrašoma…" : "Išsaugoti"}
        </button>
        {state.message && (
          <p id="min-margin-message" role="status" className={error ? "text-sm text-bad" : "text-sm text-good"}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
