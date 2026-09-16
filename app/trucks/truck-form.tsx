"use client";

import { useActionState } from "react";

import {
  DAILY_COSTS,
  DEFAULT_WORKING_DAYS_PER_MONTH,
  type TruckFormField,
} from "@/lib/truck";

import { createTruck, type CreateTruckState } from "./actions";

const INITIAL_STATE: CreateTruckState = { status: "idle" };

export function TruckForm() {
  const [state, formAction, pending] = useActionState(createTruck, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <Field
        name="plate"
        label="Valstybinis numeris"
        placeholder="NNN 888"
        state={state}
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Paros kaštai, EUR/parą</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.values(DAILY_COSTS).map(({ column, label }) => (
            <Field
              key={column}
              name={column}
              label={label}
              placeholder="0"
              inputMode="decimal"
              state={state}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">Mėnesiniai kaštai</legend>
        <Field
          name="trailer_monthly_cents"
          label="Priekabos nuoma, EUR/mėn."
          placeholder="0"
          inputMode="decimal"
          state={state}
        />
        <Field
          name="working_days_per_month"
          label="Darbo dienų per mėnesį"
          hint="Iš jų dalinami mėnesiniai kaštai."
          defaultValue={String(DEFAULT_WORKING_DAYS_PER_MONTH)}
          inputMode="numeric"
          state={state}
        />
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Įrašoma…" : "Pridėti furą"}
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
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  hint,
  placeholder,
  defaultValue = "",
  inputMode,
  state,
}: {
  name: TruckFormField;
  label: string;
  hint?: string;
  placeholder?: string;
  defaultValue?: string;
  inputMode?: "decimal" | "numeric";
  state: CreateTruckState;
}) {
  const error = state.errors?.[name];
  const errorId = `${name}-error`;

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span>{label}</span>
      <input
        name={name}
        type="text"
        inputMode={inputMode}
        placeholder={placeholder}
        defaultValue={state.values?.[name] ?? defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 aria-invalid:border-red-600 dark:border-neutral-700"
      />
      {hint && !error && <span className="text-xs text-neutral-500">{hint}</span>}
      {error && (
        <span id={errorId} className="text-xs text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}
