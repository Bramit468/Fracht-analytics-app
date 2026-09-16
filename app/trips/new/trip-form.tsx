"use client";

import { FormEvent, useState } from "react";
import { formatCents, parseEuroToCents } from "../../../lib/money";

export type TripDraft = {
  tripNumber: string;
  truckPlate: string;
  origin: string;
  destination: string;
  date: string;
  revenueCents: number;
  distanceKm: number;
  fuelUsedLiters: number;
  fuelPriceCentsPerLiter: number;
  tollsCents: number;
  driverCostCents: number;
  otherCostsCents: number;
};

type TripFormProps = {
  onValid: (trip: TripDraft) => void;
};

type FormValues = {
  tripNumber: string;
  truckPlate: string;
  origin: string;
  destination: string;
  date: string;
  revenue: string;
  distanceKm: string;
  fuelUsedLiters: string;
  fuelPrice: string;
  tolls: string;
  driverCost: string;
  otherCosts: string;
};

type FieldName = keyof FormValues;
type FormErrors = Partial<Record<FieldName, string>>;

const initialValues: FormValues = {
  tripNumber: "",
  truckPlate: "",
  origin: "",
  destination: "",
  date: "",
  revenue: "",
  distanceKm: "",
  fuelUsedLiters: "",
  fuelPrice: "",
  tolls: "",
  driverCost: "",
  otherCosts: "",
};

const textFields: Array<{
  name: "tripNumber" | "origin" | "destination";
  label: string;
  placeholder: string;
}> = [
  { name: "tripNumber", label: "Trip number", placeholder: "LT001" },
  { name: "origin", label: "Origin", placeholder: "Vilnius" },
  { name: "destination", label: "Destination", placeholder: "Hamburg" },
];

const numberFields: Array<{
  name:
    | "revenue"
    | "distanceKm"
    | "fuelUsedLiters"
    | "fuelPrice"
    | "tolls"
    | "driverCost"
    | "otherCosts";
  label: string;
  suffix: string;
  placeholder: string;
  step: string;
  money?: boolean;
}> = [
  { name: "revenue", label: "Revenue", suffix: "€", placeholder: "2400", step: "0.01", money: true },
  { name: "distanceKm", label: "Distance", suffix: "km", placeholder: "1750", step: "0.1" },
  { name: "fuelUsedLiters", label: "Fuel used", suffix: "L", placeholder: "510", step: "0.1" },
  { name: "fuelPrice", label: "Fuel price", suffix: "€/L", placeholder: "1.42", step: "0.001", money: true },
  { name: "tolls", label: "Tolls", suffix: "€", placeholder: "280", step: "0.01", money: true },
  { name: "driverCost", label: "Driver cost", suffix: "€", placeholder: "450", step: "0.01", money: true },
  { name: "otherCosts", label: "Other costs", suffix: "€", placeholder: "75", step: "0.01", money: true },
];

const truckOptions = ["NNN 888"] as const;

const moneyFields = new Set(["revenue", "fuelPrice", "tolls", "driverCost", "otherCosts"]);

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};

  for (const field of textFields) {
    if (!values[field.name].trim()) {
      errors[field.name] = "This field is required.";
    }
  }

  if (!values.truckPlate) {
    errors.truckPlate = "Select a truck.";
  }

  if (!values.date) {
    errors.date = "This field is required.";
  }

  for (const field of numberFields) {
    const value = values[field.name];

    if (value === "") {
      errors[field.name] = "This field is required.";
    } else if (moneyFields.has(field.name) ? parseEuroToCents(value) === null : !Number.isFinite(Number(value)) || Number(value) < 0) {
      errors[field.name] = "Enter zero or a positive number.";
    }
  }

  return errors;
}

export function TripForm({ onValid }: TripFormProps) {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});

  function updateField(name: FieldName, value: string) {
    setValues((current) => ({ ...current, [name]: value }));

    if (errors[name]) {
      setErrors((current) => ({ ...current, [name]: undefined }));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(values);

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    onValid({
      tripNumber: values.tripNumber.trim(),
      truckPlate: values.truckPlate,
      origin: values.origin.trim(),
      destination: values.destination.trim(),
      date: values.date,
      revenueCents: parseEuroToCents(values.revenue)!,
      distanceKm: Number(values.distanceKm),
      fuelUsedLiters: Number(values.fuelUsedLiters),
      fuelPriceCentsPerLiter: parseEuroToCents(values.fuelPrice)!,
      tollsCents: parseEuroToCents(values.tolls)!,
      driverCostCents: parseEuroToCents(values.driverCost)!,
      otherCostsCents: parseEuroToCents(values.otherCosts)!,
    });
  }

  const inputClass = (name: FieldName) =>
    `w-full rounded-xl border bg-white px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:ring-4 ${
      errors[name]
        ? "border-red-400 focus:border-red-500 focus:ring-red-100"
        : "border-slate-200 focus:border-blue-500 focus:ring-blue-100"
    }`;

  return (
    <form className="space-y-8" noValidate onSubmit={handleSubmit}>
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
          Route details
        </h2>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Truck</span>
            <select
              aria-describedby={errors.truckPlate ? "truckPlate-error" : undefined}
              aria-invalid={Boolean(errors.truckPlate)}
              className={inputClass("truckPlate")}
              name="truckPlate"
              onChange={(event) => updateField("truckPlate", event.target.value)}
              value={values.truckPlate}
            >
              <option value="">Select a truck</option>
              {truckOptions.map((plate) => (
                <option key={plate} value={plate}>{plate}</option>
              ))}
            </select>
            {errors.truckPlate && (
              <span className="mt-1.5 block text-sm text-red-600" id="truckPlate-error">
                {errors.truckPlate}
              </span>
            )}
          </label>
          {textFields.map((field) => (
            <label className="block" key={field.name}>
              <span className="mb-2 block text-sm font-medium text-slate-700">
                {field.label}
              </span>
              <input
                aria-describedby={errors[field.name] ? `${field.name}-error` : undefined}
                aria-invalid={Boolean(errors[field.name])}
                className={inputClass(field.name)}
                name={field.name}
                onChange={(event) => updateField(field.name, event.target.value)}
                placeholder={field.placeholder}
                type="text"
                value={values[field.name]}
              />
              {errors[field.name] && (
                <span className="mt-1.5 block text-sm text-red-600" id={`${field.name}-error`}>
                  {errors[field.name]}
                </span>
              )}
            </label>
          ))}

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Date</span>
            <input
              aria-describedby={errors.date ? "date-error" : undefined}
              aria-invalid={Boolean(errors.date)}
              className={inputClass("date")}
              name="date"
              onChange={(event) => updateField("date", event.target.value)}
              type="date"
              value={values.date}
            />
            {errors.date && (
              <span className="mt-1.5 block text-sm text-red-600" id="date-error">
                {errors.date}
              </span>
            )}
          </label>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
          Revenue and costs
        </h2>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {numberFields.map((field) => (
            <label className="block" key={field.name}>
              <span className="mb-2 block text-sm font-medium text-slate-700">
                {field.label}
              </span>
              <span className="relative block">
                <input
                  aria-describedby={errors[field.name] ? `${field.name}-error` : undefined}
                  aria-invalid={Boolean(errors[field.name])}
                  className={`${inputClass(field.name)} pr-16`}
                  inputMode="decimal"
                  min="0"
                  name={field.name}
                  onChange={(event) => updateField(field.name, event.target.value)}
                  placeholder={field.placeholder}
                  step={field.step}
                  type={field.money ? "text" : "number"}
                  value={values[field.name]}
                />
                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-medium text-slate-500">
                  {field.suffix}
                </span>
              </span>
              {errors[field.name] && (
                <span className="mt-1.5 block text-sm text-red-600" id={`${field.name}-error`}>
                  {errors[field.name]}
                </span>
              )}
            </label>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">All fields are required.</p>
        <button
          className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
          type="submit"
        >
          Continue to calculation
        </button>
      </div>
    </form>
  );
}
