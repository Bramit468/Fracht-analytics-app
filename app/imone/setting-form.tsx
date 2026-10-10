"use client";

import { useActionState } from "react";

import type { SettingState } from "./actions";

const INITIAL_STATE: SettingState = { status: "idle" };

/** Vienas įmonės nustatymas procentais (#181, #187). Tuščias laukas – išjungta. */
export function SettingForm({
  name,
  label,
  placeholder,
  current,
  action,
}: {
  name: string;
  label: string;
  placeholder: string;
  current: number | null;
  action: (previous: SettingState, formData: FormData) => Promise<SettingState>;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const error = state.status === "error";
  const shown = current === null ? "" : String(current).replace(".", ",");
  const messageId = `${name}-message`;

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <label className="flex flex-col gap-1 text-sm">
        <span>{label}</span>
        <input
          name={name}
          type="text"
          inputMode="decimal"
          placeholder={placeholder}
          defaultValue={state.value ?? shown}
          aria-invalid={error ? true : undefined}
          aria-describedby={state.message ? messageId : undefined}
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
          <p id={messageId} role="status" className={error ? "text-sm text-bad" : "text-sm text-good"}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
