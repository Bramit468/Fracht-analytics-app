"use client";

import Link from "next/link";
import { useActionState } from "react";

import { deleteTruck, type DeleteTruckState } from "./actions";

const INITIAL_STATE: DeleteTruckState = { status: "idle" };

/** Vienos furos veiksmai sąraše: taisymo nuoroda ir trynimas (#39). */
export function TruckRowActions({ id, plate }: { id: string; plate: string }) {
  const [state, formAction, pending] = useActionState(deleteTruck, INITIAL_STATE);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-4">
        <Link href={`/trucks/${id}/edit`} className="underline">
          Redaguoti
        </Link>
        <form
          action={formAction}
          onSubmit={(event) => {
            // Trynimas neatstatomas, todėl klausiama prieš siunčiant.
            if (!confirm(`Ištrinti furą ${plate}? Atstatyti nebus galima.`)) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            disabled={pending}
            className="text-red-600 underline disabled:opacity-50"
          >
            {pending ? "Trinama…" : "Ištrinti"}
          </button>
        </form>
      </div>
      {state.message && (
        <p role="alert" className="text-xs text-red-600">
          {state.message}
        </p>
      )}
    </div>
  );
}
