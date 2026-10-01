"use client";

import { useActionState } from "react";

import {
  DAILY_COSTS,
  DEFAULT_WORKING_DAYS_PER_MONTH,
  truckRowToFormValues,
  WEIGHT_LABELS,
  type TruckFormField,
  type TruckFormValues,
} from "@/lib/truck";
import { PROFILE_FIELDS, type ProfileFieldSpec } from "@/lib/truck-profile";
import type { Truck } from "@/types/truck";

import { saveTruck, type SaveTruckState } from "./actions";

const INITIAL_STATE: SaveTruckState = { status: "idle" };

const inputClass =
  "rounded-md border border-line bg-surface px-3 py-2 aria-invalid:border-bad";

function profileField(field: ProfileFieldSpec["field"]): ProfileFieldSpec {
  const spec = PROFILE_FIELDS.find((row) => row.field === field);
  if (!spec) throw new Error(`Nežinomas kortelės laukas: ${field}`);
  return spec;
}

/**
 * Naujos furos forma, su `truck` – tos pačios furos taisymas (#39).
 *
 * Privalomas tik numeris (#164). Visa kita neprivaloma, bet sugrupuota taip,
 * kaip apie furą galvoja vežėjas: kas ji, kokia techniškai, kiek kainuoja
 * paroje ir kada baigiasi jos dokumentai.
 */
export function TruckForm({ truck }: { truck?: Truck }) {
  const [state, formAction, pending] = useActionState(saveTruck, INITIAL_STATE);
  const defaults = truck ? truckRowToFormValues(truck) : {};
  const common = { state, defaults };

  return (
    <form action={formAction} className="flex flex-col gap-8" noValidate>
      <input type="hidden" name="id" value={truck?.id ?? ""} />

      <Section title="Apie furą">
        <Field name="plate" label="Valstybinis numeris *" placeholder="NNN 888" {...common} />
        {(["make", "model", "manufacture_year", "vin", "trailer_plate"] as const).map((field) => (
          <ProfileInput key={field} spec={profileField(field)} {...common} />
        ))}
      </Section>

      {/* EURO klasė ir ašys lemia kelių mokesčius, svoriai – PTV kuro įvertį. */}
      <Section title="Techniniai duomenys">
        {(["euro_class", "axles", "fuel_type"] as const).map((field) => (
          <ProfileInput key={field} spec={profileField(field)} {...common} />
        ))}
        <Field name="empty_weight_kg" label={WEIGHT_LABELS.empty_weight_kg} placeholder="15000" inputMode="numeric" {...common} />
        <Field name="total_permitted_weight_kg" label={WEIGHT_LABELS.total_permitted_weight_kg} placeholder="40000" inputMode="numeric" {...common} />
      </Section>

      <Section title="Normos" hint="Naudojamos, kai telematika apie furą dar nieko nežino.">
        {(["fuel_norm_l_per_100km", "adblue_norm_l_per_100km"] as const).map((field) => (
          <ProfileInput key={field} spec={profileField(field)} {...common} />
        ))}
      </Section>

      <Section title="Paros kaštai, EUR/parą" hint="Didžioji reiso kaštų dalis — nuo jų priklauso kiekvieno reiso pelnas.">
        {Object.values(DAILY_COSTS).map(({ column, label }) => (
          <Field key={column} name={column} label={label} placeholder="0" inputMode="decimal" {...common} />
        ))}
      </Section>

      <Section title="Mėnesiniai kaštai">
        <Field name="trailer_monthly_cents" label="Priekabos nuoma, EUR/mėn." placeholder="0" inputMode="decimal" {...common} />
        <Field
          name="working_days_per_month"
          label="Darbo dienų per mėnesį"
          hint="Iš jų dalinami mėnesiniai kaštai."
          defaultValue={String(DEFAULT_WORKING_DAYS_PER_MONTH)}
          inputMode="numeric"
          {...common}
        />
      </Section>

      <Section title="Dokumentai">
        {(["inspection_valid_until", "insurance_valid_until", "tachograph_calibration_until"] as const).map((field) => (
          <ProfileInput key={field} spec={profileField(field)} {...common} />
        ))}
      </Section>

      <Section title="Pastabos" wide>
        <ProfileInput spec={profileField("notes")} {...common} />
      </Section>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-50"
        >
          {pending ? "Įrašoma…" : truck ? "Išsaugoti pakeitimus" : "Pridėti furą"}
        </button>
        {state.message && (
          <p role="status" className={state.status === "error" ? "text-sm text-bad" : "text-sm text-good"}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

function Section({
  title,
  hint,
  wide = false,
  children,
}: {
  title: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-base font-semibold">{title}</legend>
      {hint && <p className="-mt-1 text-sm text-muted">{hint}</p>}
      <div className={wide ? "grid gap-3" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
        {children}
      </div>
    </fieldset>
  );
}

interface FieldState {
  state: SaveTruckState;
  defaults: TruckFormValues;
}

function current(name: TruckFormField, { state, defaults }: FieldState, fallback = ""): string {
  return state.values?.[name] ?? defaults[name] ?? fallback;
}

function ErrorText({ name, state }: { name: TruckFormField; state: SaveTruckState }) {
  const error = state.errors?.[name];
  if (!error) return null;
  return (
    <span id={`${name}-error`} className="text-xs text-bad">
      {error}
    </span>
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
} & FieldState) {
  const error = state.errors?.[name];

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span>{label}</span>
      <input
        name={name}
        type="text"
        inputMode={inputMode}
        placeholder={placeholder}
        defaultValue={current(name, { state, defaults }, defaultValue)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
        className={inputClass}
      />
      {hint && !error && <span className="text-xs text-muted">{hint}</span>}
      <ErrorText name={name} state={state} />
    </label>
  );
}

/** Kortelės laukas: tekstas, pasirinkimas, data arba ilgas tekstas pagal tipą. */
function ProfileInput({ spec, state, defaults }: { spec: ProfileFieldSpec } & FieldState) {
  const name = spec.field;
  const error = state.errors?.[name];
  const value = current(name, { state, defaults });
  const shared = {
    name,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${name}-error` : undefined,
    className: inputClass,
  } as const;

  let control: React.ReactNode;
  if (spec.spec.kind === "choice") {
    control = (
      <select {...shared} defaultValue={value}>
        <option value="">Nenurodyta</option>
        {spec.spec.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  } else if (spec.spec.kind === "date") {
    control = <input {...shared} type="date" defaultValue={value} />;
  } else if (name === "notes") {
    control = <textarea {...shared} rows={3} defaultValue={value} />;
  } else {
    const numeric = spec.spec.kind === "integer" || spec.spec.kind === "decimal";
    control = (
      <input
        {...shared}
        type="text"
        inputMode={spec.spec.kind === "decimal" ? "decimal" : numeric ? "numeric" : undefined}
        placeholder={spec.placeholder}
        defaultValue={value}
      />
    );
  }

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span>{spec.label}</span>
      {control}
      <ErrorText name={name} state={state} />
    </label>
  );
}
