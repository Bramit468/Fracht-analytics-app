"use client";

import { useState } from "react";

import {
  EXTRA_STOP_TYPES,
  MAX_STOPS,
  STOP_TYPE_LABELS,
  stopLetter,
  type Stop,
  type StopType,
} from "@/lib/stops";

import { AddressField } from "./address-field";

/**
 * Sustojimų sąrašas: tipas, adresas su pasiūlymais, tvarka.
 *
 * Tas pats komponentas rodomas dviejose vietose – reiso formoje (tik papildomi
 * sustojimai, nes „Iš“ ir „Į“ ten yra atskiri laukai) ir padidinto žemėlapio
 * šone (visi sustojimai). Būsena gyvena formoje, tad abi vietos rodo tą patį.
 */
export function StopsEditor({
  stops,
  includeEnds,
  enabled,
  inputClass,
  onUpdate,
  onAdd,
  onRemove,
  onMove,
}: {
  stops: Stop[];
  /** `true` – ir pakrovimas su iškrovimu; `false` – tik papildomi. */
  includeEnds: boolean;
  enabled: boolean;
  inputClass: string;
  onUpdate: (index: number, change: Partial<Pick<Stop, "type" | "address" | "point">>) => void;
  onAdd: (type: StopType) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, delta: -1 | 1) => void;
}) {
  const [newType, setNewType] = useState<StopType>("extra_unloading");
  const last = stops.length - 1;
  const visible = stops.flatMap((stop, index) => (includeEnds || (index > 0 && index < last) ? [{ stop, index }] : []));

  return <div className="space-y-3">
    {visible.length === 0 && <p className="text-sm text-muted">Papildomų sustojimų nėra.</p>}

    <ol className="space-y-3">
      {visible.map(({ stop, index }) => {
        const isEnd = index === 0 || index === last;
        return <li key={stop.id} className="rounded-lg border bg-page p-3">
          <div className="flex items-center gap-2">
            <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-raised text-sm font-bold">
              {stopLetter(index)}
            </span>
            {isEnd
              ? <span className="font-medium">{STOP_TYPE_LABELS[stop.type]}</span>
              : <select
                aria-label={`Sustojimo ${stopLetter(index)} tipas`}
                value={stop.type}
                onChange={(event) => onUpdate(index, { type: event.target.value as StopType })}
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface p-2 text-sm"
              >
                {EXTRA_STOP_TYPES.map((type) => <option key={type} value={type}>{STOP_TYPE_LABELS[type]}</option>)}
              </select>}
            {!isEnd && <span className="ml-auto flex shrink-0 gap-1">
              <button type="button" onClick={() => onMove(index, -1)} disabled={index <= 1} aria-label={`Sustojimą ${stopLetter(index)} pakelti`} className="rounded border bg-surface px-2 py-1 disabled:opacity-30">↑</button>
              <button type="button" onClick={() => onMove(index, 1)} disabled={index >= last - 1} aria-label={`Sustojimą ${stopLetter(index)} nuleisti`} className="rounded border bg-surface px-2 py-1 disabled:opacity-30">↓</button>
              <button type="button" onClick={() => onRemove(index)} aria-label={`Pašalinti sustojimą ${stopLetter(index)}`} className="rounded border bg-surface px-2 py-1">✕</button>
            </span>}
          </div>
          <div className="mt-2">
            <AddressField
              label="Adresas"
              value={stop.address}
              point={stop.point}
              onChange={(address, point) => onUpdate(index, { address, point })}
              enabled={enabled}
              inputClass={inputClass}
            />
          </div>
        </li>;
      })}
    </ol>

    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Naujo sustojimo tipas"
        value={newType}
        onChange={(event) => setNewType(event.target.value as StopType)}
        className="rounded-lg border border-line bg-surface p-2 text-sm"
      >
        {EXTRA_STOP_TYPES.map((type) => <option key={type} value={type}>{STOP_TYPE_LABELS[type]}</option>)}
      </select>
      <button
        type="button"
        onClick={() => onAdd(newType)}
        disabled={stops.length >= MAX_STOPS}
        className="rounded-lg border bg-surface px-3 py-2 text-sm disabled:opacity-50"
      >
        Pridėti sustojimą
      </button>
      {stops.length >= MAX_STOPS && <span className="text-xs text-muted">Daugiausia {MAX_STOPS} sustojimai.</span>}
    </div>
  </div>;
}
