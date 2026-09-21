"use client";

import { useActionState } from "react";

import {
  DAILY_COSTS,
  DEFAULT_WORKING_DAYS_PER_MONTH,
  truckRowToFormValues,
  type TruckFormField,
  type TruckFormValues,
} from "@/lib/truck";
import type { Truck } from "@/types/truck";

import { saveTruck, type SaveTruckState } from "./actions";

const INITIAL_STATE: SaveTruckState = { status: "idle" };

/** Be `truck` — naujos furos forma, su juo — tos pačios furos taisymas (#39). */
export function TruckForm({ truck }: { truck?: Truck }) {
  const [state, formAction, pending] = useActionState(saveTruck, INITIAL_STATE);
  const defaults = truck ? truckRowToFormValues(truck) : {};

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="id" value={truck?.id ?? ""} />

      <Field
        name="plate"
        label="Valstybinis numeris"
        placeholder="NNN 888"
        state={state}
        defaults={defaults}
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
              defaults={defaults}
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
          defaults={defaults}
        />
        <Field
          name="working_days_per_month"
          label="Darbo dienų per mėnesį"
          hint="Iš jų dalinami mėnesiniai kaštai."
          defaultValue={String(DEFAULT_WORKING_DAYS_PER_MONTH)}
          inputMode="numeric"
          state={state}
          defaults={defaults}
        />
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending
            ? "Įrašoma…"
            : truck
              ? "Išsaugoti pakeitimus"
              : "Pridėti furą"}
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
  defaults,
}: {
  name: TruckFormField;
  label: string;
  hint?: string;
  placeholder?: string;
  defaultValue?: string;
  inputMode?: "decimal" | "numeric";
  state: SaveTruckState;
  defaults: TruckFormValues;
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
        defaultValue={state.values?.[name] ?? defaults[name] ?? defaultValue}
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
