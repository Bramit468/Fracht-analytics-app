import { expect, it } from "vitest";
import { buildImportPreview, suggestColumnMapping, type ExcelCell } from "./excel-import";
import type { CountryTariff } from "./calc";
import type { Truck } from "../types/truck";

const truck: Truck = {
  id: "truck-1",
  plate: "NNN 888",
  depreciation_cents: 0,
  interest_cents: 0,
  insurance_kasko_cents: 0,
  insurance_civil_cents: 0,
  insurance_cmr_cents: 0,
  driver_salary_cents: 0,
  per_diem_cents: 0,
  repairs_cents: 0,
  management_cents: 0,
  trailer_monthly_cents: 0,
  working_days_per_month: 22,
  empty_weight_kg: null,
  total_permitted_weight_kg: null,
};
const tariffs: CountryTariff[] = [{ country: "Nemokami", rate: 0, rateType: "per_km" }];
const headers = ["Trip number", "Truck", "Origin", "Destination", "Date", "Distance", "Revenue"];
const mapping = suggestColumnMapping(headers);

it("matches common Excel column names", () => {
  expect(mapping).toMatchObject({
    tripNumber: 0,
    truckPlate: 1,
    origin: 2,
    destination: 3,
    tripDate: 4,
    paidKm: 5,
    revenue: 6,
  });
});

it("builds a valid trip and applies optional defaults", () => {
  const preview = buildImportPreview([
    ["LT001", "nnn 888", "Vilnius", "Hamburg", "20.09.2026", "1750,5", "2400,25"],
  ], mapping, [truck], tariffs);

  expect(preview.invalidRows).toEqual([]);
  expect(preview.validRows[0]).toMatchObject({
    sourceRow: 2,
    trip: {
      trip_number: "LT001",
      trip_date: "2026-09-20",
      truck_id: "truck-1",
      days: 1,
      paid_km: 1750.5,
      empty_km: 0,
      freight_price_cents: 240025,
      fuel_l_per_100km: 0,
      bridges_cents: 0,
    },
    legs: [{ country: "Nemokami", km: 1750.5 }],
  });
});

it("keeps valid rows when another row is invalid", () => {
  const preview = buildImportPreview([
    ["LT001", "NNN 888", "Vilnius", "Hamburg", "2026-09-20", 100, 500],
    ["LT002", "UNKNOWN", "Kaunas", "Warsaw", "2026-09-21", 200, 600],
  ], mapping, [truck], tariffs);

  expect(preview.validRows).toHaveLength(1);
  expect(preview.invalidRows).toEqual([{
    sourceRow: 3,
    tripNumber: "LT002",
    reason: "Furos UNKNOWN nėra sąraše.",
  }]);
});

it("previews 100 valid rows", () => {
  const rows: ExcelCell[][] = Array.from({ length: 100 }, (_, index) => [
    `LT${String(index + 1).padStart(3, "0")}`,
    "NNN 888",
    "Vilnius",
    "Hamburg",
    new Date(2026, 8, 20),
    1000,
    2000,
  ]);

  expect(buildImportPreview(rows, mapping, [truck], tariffs)).toMatchObject({
    validRows: expect.arrayContaining([expect.objectContaining({ sourceRow: 101 })]),
    invalidRows: [],
  });
});
