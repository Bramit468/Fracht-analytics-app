"use client";

import { useActionState } from "react";

import { calcDailyRate } from "@/lib/calc";
import { formatCents } from "@/lib/money";
import { truckRowToFormValues, truckRowToCalc } from "@/lib/truck";
import {
  costFieldName,
  costLabel,
  COST_SHORT_LABELS,
  TRUCK_COST_FIELDS,
  type TruckCostField,
} from "@/lib/truck-costs-bulk";
import type { Truck } from "@/types/truck";

import { saveTruckCosts, type SaveTruckCostsState } from "../actions";

const INITIAL_STATE: SaveTruckCostsState = { status: "idle" };

/** Visų furų kaštai vienoje lentelėje, vienas mygtukas (#99). */
export function CostTable({ trucks, copied }: { trucks: Truck[]; copied: string[] }) {
  const [state, formAction, pending] = useActionState(saveTruckCosts, INITIAL_STATE);
  const copiedIds = new Set(copied);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-left dark:border-neutral-700">
              <th className="sticky left-0 bg-background py-2 pr-4 font-medium">Numeris</th>
              {TRUCK_COST_FIELDS.map((field) => (
                <th key={field} title={costLabel(field)} className="py-2 pr-3 font-medium">
                  {COST_SHORT_LABELS[field]}
                </th>
              ))}
              <th className="py-2 text-right font-medium">Paros savikaina</th>
            </tr>
          </thead>
          <tbody>
            {trucks.map((truck) => {
              const saved = truckRowToFormValues(truck);
              const errors = state.errors?.[truck.id];

              return (
                <tr
                  key={truck.id}
                  className="border-b border-neutral-200 align-top dark:border-neutral-800"
                >
                  <th
                    scope="row"
                    className="sticky left-0 whitespace-nowrap bg-background py-2 pr-4 text-left font-mono font-normal"
                  >
                    {truck.plate}
                    {copiedIds.has(truck.id) && (
                      <span
                        title="Šios furos kaštai iki cento sutampa su kita fura — greičiausiai nukopijuoti."
                        className="ml-2 text-xs text-amber-600"
                      >
                        nepatikslinta
                      </span>
                    )}
                  </th>

                  {TRUCK_COST_FIELDS.map((field) => (
                    <td key={field} className="py-2 pr-3">
                      <Cell
                        truckId={truck.id}
                        field={field}
                        defaultValue={state.values?.[truck.id]?.[field] ?? saved[field] ?? ""}
                        error={errors?.[field]}
                        plate={truck.plate}
                      />
                    </td>
                  ))}

                  <td className="py-2 text-right tabular-nums text-neutral-500">
                    {formatCents(calcDailyRate(truckRowToCalc(truck)))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Įrašoma…" : "Išsaugoti pakeitimus"}
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

function Cell({
  truckId,
  field,
  defaultValue,
  error,
  plate,
}: {
  truckId: string;
  field: TruckCostField;
  defaultValue: string;
  error?: string;
  plate: string;
}) {
  const name = costFieldName(truckId, field);

  return (
    <>
      <input
        name={name}
        type="text"
        inputMode="decimal"
        // Lentelėje antraštė toli nuo lauko, todėl balsu jis skaitomas taip.
        aria-label={`${plate}: ${costLabel(field)}`}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
        className="w-24 rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-right tabular-nums aria-invalid:border-red-600 dark:border-neutral-700"
      />
      {error && (
        <span id={`${name}-error`} className="mt-1 block max-w-32 text-xs text-red-600">
          {error}
        </span>
      )}
    </>
  );
}
