"use client";

import { actualsToCsv, fuelPricesToCsv, reportFileName } from "@/lib/report-export";
import type { FuelPriceRow } from "@/lib/fuel-prices";
import type { ActualCosts } from "@/lib/telematics-costs";

import { downloadCsv } from "../download-csv";

/**
 * Faktinių kaštų atsisiuntimas (#141).
 *
 * Būtent šios lentelės prašo buhalterija, o iki šiol ji buvo vienintelė, kurios
 * iškelti nebuvo galima. Failo varde lieka laikotarpis: tos pačios furos
 * rugpjūčio ir rugsėjo failai kitaip būtų neatskiriami.
 */
export function ExportButtons({
  actuals,
  fuelByCountry,
  from,
  to,
}: {
  actuals: ActualCosts[];
  fuelByCountry: FuelPriceRow[];
  from: string;
  to: string;
}) {
  const period = `${from}_${to}`;

  return (
    <div className="flex flex-wrap gap-4 text-sm">
      <button
        type="button"
        onClick={() => downloadCsv(reportFileName("faktiniai-kastai", period), actualsToCsv(actuals))}
        className="font-semibold text-blue-600 underline"
      >
        Atsisiųsti kaštus Excel lentelei
      </button>
      {fuelByCountry.length > 0 && (
        <button
          type="button"
          onClick={() =>
            downloadCsv(
              reportFileName("kuro-kainos", period),
              fuelPricesToCsv(fuelByCountry, "Šalis"),
            )
          }
          className="font-semibold text-blue-600 underline"
        >
          Atsisiųsti kuro kainas
        </button>
      )}
    </div>
  );
}
