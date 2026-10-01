"use client";

import { useMemo, useState } from "react";

import { estimateTripDuration, type DurationPlan } from "@/lib/trip-duration";
import { TRIP_DURATION, type WeeklyRest } from "@/lib/trip-duration-config";

function hoursText(hours: number): string {
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)} val. ${minutes % 60} min.`;
}

function kmText(km: number): string {
  return `${Math.round(km).toLocaleString("lt-LT")} km`;
}

function arrivalText(arrival: string | null): string {
  return arrival ? arrival.replace("T", " ") : "—";
}

/**
 * Apytikslė reiso trukmė su vairuotojo poilsiu.
 *
 * Tai planavimo įvertis pagal prielaidas iš `trip-duration-config.ts`. Į formos
 * „paros“ jis nieko neįrašo: furos kaštus lemia tikras PTV vairavimo laiko planas.
 */
export function TripDurationPanel({ km, departure }: { km: number; departure?: string }) {
  const [weeklyRest, setWeeklyRest] = useState<WeeklyRest>(TRIP_DURATION.defaultWeeklyRest);
  const { best, realistic } = useMemo(
    () => estimateTripDuration(km, weeklyRest, departure),
    [km, weeklyRest, departure],
  );

  const rows: [string, (plan: DurationPlan) => string][] = [
    ["Vairavimo paros", (plan) => String(plan.drivingDays)],
    ["Vairavimo laikas", (plan) => hoursText(plan.drivingHours)],
    ["Paros poilsiai", (plan) => `${plan.dailyRests} × ${TRIP_DURATION.dailyRestHours} val.`],
    ["Savaitinis poilsis", (plan) => plan.weeklyRestRequired ? `taip, ${plan.weeklyRests} × ${plan.weeklyRestHours} val.` : "nereikalingas"],
    ["Iš viso su pertraukomis ir poilsiu", (plan) => `${hoursText(plan.elapsedHours)} (${plan.calendarDays} kal. d.)`],
    ["Atvykimas", (plan) => arrivalText(plan.arrival)],
    ["Km iki savaitinio poilsio", (plan) => kmText(plan.kmBeforeWeeklyRest)],
    ["Km per 7 paras (ciklas)", (plan) => kmText(plan.kmPerWeek)],
  ];

  return <section aria-label="Reiso trukmė" className="mt-3 rounded-lg border bg-surface p-3 text-sm">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h3 className="font-semibold">Reiso trukmė su poilsiu · {kmText(km)}</h3>
      <label>
        Savaitinis poilsis
        <select
          value={weeklyRest}
          onChange={(event) => setWeeklyRest(event.target.value as WeeklyRest)}
          className="ml-2 rounded-lg border border-line bg-surface p-2"
        >
          <option value="regular">{TRIP_DURATION.weeklyRestHours.regular} val. (įprastas)</option>
          <option value="reduced">{TRIP_DURATION.weeklyRestHours.reduced} val. (sutrumpintas)</option>
        </select>
      </label>
    </div>

    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-96 text-left tabular-nums">
        <thead>
          <tr className="text-muted">
            <th scope="col" className="py-1 pr-3 font-normal"></th>
            <th scope="col" className="py-1 pr-3 font-medium">Geriausias atvejis ({TRIP_DURATION.best.speedKmh} km/h, {TRIP_DURATION.best.maxDayKm} km/d.)</th>
            <th scope="col" className="py-1 font-medium">Realistiškai ({TRIP_DURATION.realistic.speedKmh} km/h, {TRIP_DURATION.realistic.maxDayKm} km/d.)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, cell]) => <tr key={label} className="border-t">
            <th scope="row" className="py-1 pr-3 text-left font-normal text-muted">{label}</th>
            <td className="py-1 pr-3">{cell(best)}</td>
            <td className="py-1">{cell(realistic)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>

    {best.spansWeekend && <p className="mt-2 text-ink">
      Reisas kerta savaitgalį: į atvykimo laiką įskaičiuotas {best.weeklyRestHours} val. savaitinis poilsis.
    </p>}
    {weeklyRest === "reduced" && <p className="mt-2 text-muted">
      Sutrumpintą poilsį reikia kompensuoti, ir dviejų iš eilės vienas po kito negalima.
    </p>}
    <p className="mt-2 text-xs text-muted">
      Apytikslis planavimo įvertis. Tikslų atvykimą su pertraukomis rodo „Vairavimo laikas ir atvykimas“ (PTV).
      {!departure && " Be išvykimo datos savaitgalis neįskaičiuojamas."}
    </p>
  </section>;
}
