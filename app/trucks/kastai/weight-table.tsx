"use client";

import { useActionState, useState } from "react";

import { truckRowToFormValues, WEIGHT_FIELDS, WEIGHT_LABELS } from "@/lib/truck";
import { weightFieldName } from "@/lib/truck-weights-bulk";
import type { Truck } from "@/types/truck";

import { saveTruckWeights, type SaveTruckCostsState } from "../actions";

const INITIAL_STATE: SaveTruckCostsState = { status: "idle" };

/**
 * Visų furų svoriai vienoje lentelėje (#121).
 *
 * Nuo jų priklauso PTV kuro ir CO2e įvertis: tos pačios kelionės kuras su 20 t
 * kroviniu ir su 5 t skiriasi trečdaliu.
 */
export function WeightTable({ trucks, missing }: { trucks: Truck[]; missing: number }) {
  const [state, formAction, pending] = useActionState(saveTruckWeights, INITIAL_STATE);
  // Parkas dažnai vienodas, todėl tuščius laukus galima užpildyti iš karto.
  const [visiems, setVisiems] = useState({ empty_weight_kg: "", total_permitted_weight_kg: "40000" });
  const [fill, setFill] = useState(0);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {missing > 0 && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Furų be svorių: {missing} iš {trucks.length}. Joms PTV kuro ir CO₂ skaičiuoja pagal
          numatytą 40 t vilkiką, o ne pagal jūsiškį.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border p-3 text-sm">
        <span className="font-medium">Užpildyti tuščius laukus visoms furoms:</span>
        {WEIGHT_FIELDS.map((field) => (
          <label key={field} className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">{WEIGHT_LABELS[field]}</span>
            <input
              type="text"
              inputMode="numeric"
              value={visiems[field]}
              onChange={(event) => setVisiems((current) => ({ ...current, [field]: event.target.value }))}
              className="w-28 rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-right tabular-nums dark:border-neutral-700"
            />
          </label>
        ))}
        {/* Jau suvestų svorių neperrašo: jie įrašyti sąmoningai. */}
        <button type="button" onClick={() => setFill((count) => count + 1)} className="underline">
          Užpildyti tuščius
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-left dark:border-neutral-700">
              <th className="py-2 pr-4 font-medium">Numeris</th>
              {WEIGHT_FIELDS.map((field) => (
                <th key={field} className="py-2 pr-4 font-medium">{WEIGHT_LABELS[field]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trucks.map((truck) => {
              const saved = truckRowToFormValues(truck);
              const errors = state.errors?.[truck.id];

              return (
                <tr key={truck.id} className="border-b border-neutral-200 align-top dark:border-neutral-800">
                  <th scope="row" className="py-2 pr-4 text-left font-mono font-normal">
                    {truck.plate}
                  </th>
                  {WEIGHT_FIELDS.map((field) => {
                    const name = weightFieldName(truck.id, field);
                    const error = errors?.[field];
                    const typed = state.values?.[truck.id]?.[field];
                    const current = typed ?? saved[field] ?? "";

                    return (
                      <td key={field} className="py-2 pr-4">
                        <input
                          // `key` su užpildymo skaitikliu priverčia lauką pasiimti
                          // naują pradinę reikšmę, nepaverčiant jo valdomu.
                          key={`${name}-${fill}`}
                          name={name}
                          type="text"
                          inputMode="numeric"
                          aria-label={`${truck.plate}: ${WEIGHT_LABELS[field]}`}
                          defaultValue={current === "" && fill > 0 ? visiems[field] : current}
                          aria-invalid={error ? true : undefined}
                          aria-describedby={error ? `${name}-error` : undefined}
                          className="w-28 rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-right tabular-nums aria-invalid:border-red-600 dark:border-neutral-700"
                        />
                        {error && (
                          <span id={`${name}-error`} className="mt-1 block max-w-40 text-xs text-red-600">
                            {error}
                          </span>
                        )}
                      </td>
                    );
                  })}
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
          {pending ? "Įrašoma…" : "Išsaugoti svorius"}
        </button>
        {state.message && (
          <p role="status" className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-green-700"}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
