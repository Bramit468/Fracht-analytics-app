"use client";

import { useActionState } from "react";

import { centsToInput, formatCents } from "@/lib/money";
import { MONTH_COST_FIELDS, monthCostFieldName, monthCostTotal, type MonthCostRow } from "@/lib/truck-month-costs";

import { saveTruckMonthCosts, type SaveMonthCostsState } from "./actions";

const INITIAL_STATE: SaveMonthCostsState = { status: "idle" };

/**
 * Faktiškai sumokėti kaštai per mėnesį – visoms furoms vienoje lentelėje.
 * Jie lyginami su reisų pelnu suvestinės skirtuke „Furos“.
 */
export function MonthCostTable({ trucks, month, saved }: {
  trucks: { id: string; plate: string }[];
  /** „2026-10-01“ */
  month: string;
  saved: MonthCostRow[];
}) {
  const [state, formAction, pending] = useActionState(saveTruckMonthCosts, INITIAL_STATE);
  const byTruck = new Map(saved.map((row) => [row.truck_id, row]));

  return (
    <div className="flex flex-col gap-4">
      {/* Mėnuo – adrese, kad būtų galima grįžti ir nuoroda vestų tiesiai į jį. */}
      <form method="get" className="flex items-center gap-2 text-sm">
        <input type="hidden" name="skiltis" value="faktiniai" />
        <label className="flex items-center gap-2">
          Mėnuo
          <input
            type="month"
            name="menuo"
            defaultValue={month.slice(0, 7)}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
            className="rounded-md border border-line-strong bg-surface px-2.5 py-1"
          />
        </label>
        <span className="text-muted">Įvesta furų: {saved.length} iš {trucks.length}</span>
      </form>

      <form key={month} action={formAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="month" value={month} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-2 pr-4 font-medium">Numeris</th>
                {MONTH_COST_FIELDS.map((field) => (
                  <th key={field.key} title={field.hint || undefined} className="py-2 pr-4 font-medium">{field.label}</th>
                ))}
                <th className="py-2 pr-4 text-right font-medium">Iš viso</th>
              </tr>
            </thead>
            <tbody>
              {trucks.map((truck) => {
                const row = byTruck.get(truck.id);
                const errors = state.errors?.[truck.id];
                return (
                  <tr key={truck.id} className="border-b border-line align-top">
                    <th scope="row" className="py-2 pr-4 text-left font-mono font-normal">{truck.plate}</th>
                    {MONTH_COST_FIELDS.map((field) => {
                      const name = monthCostFieldName(truck.id, field.key);
                      const error = errors?.[field.key];
                      const typed = state.values?.[truck.id]?.[field.key];
                      return (
                        <td key={field.key} className="py-2 pr-3">
                          <input
                            name={name}
                            type="text"
                            inputMode="decimal"
                            aria-label={`${truck.plate}: ${field.label}`}
                            defaultValue={typed ?? (row && row[field.key] > 0 ? centsToInput(row[field.key]) : "")}
                            aria-invalid={error ? true : undefined}
                            title={error}
                            className="w-24 rounded-md border border-line bg-transparent px-2 py-1 text-right tabular-nums aria-invalid:border-bad"
                          />
                        </td>
                      );
                    })}
                    <td className="py-2 pr-4 text-right tabular-nums text-muted">{row ? formatCents(monthCostTotal(row)) : "neįvesta"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={pending} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-50">
            {pending ? "Įrašoma…" : "Išsaugoti mėnesio kaštus"}
          </button>
          {state.message && (
            <p role="status" className={state.status === "error" ? "text-sm text-bad" : "text-sm text-good"}>{state.message}</p>
          )}
        </div>
      </form>
    </div>
  );
}
