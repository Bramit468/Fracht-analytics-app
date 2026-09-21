import { describe, expect, it } from "vitest";

import { calcDailyRate } from "./calc";
import {
  DAILY_COSTS,
  TRUCK_FORM_FIELDS,
  normalizePlate,
  parseTruckForm,
  readTruckFormValues,
  truckRowToCalc,
  truckRowToFormValues,
  type TruckFormValues,
} from "./truck";

/** Vilkikas NNN 888 iš Omniva Excel'io, taip kaip vartotojas jį įvestų. */
const OMNIVA_FORM: TruckFormValues = {
  plate: " nnn  888 ",
  depreciation_cents: "57",
  interest_cents: "0",
  insurance_kasko_cents: "4",
  insurance_civil_cents: "8",
  insurance_cmr_cents: "2",
  driver_salary_cents: "145",
  per_diem_cents: "",
  repairs_cents: "28",
  management_cents: "",
  trailer_monthly_cents: "550",
  working_days_per_month: "22",
};

describe("parseTruckForm", () => {
  it("Omniva fura: eurai paverčiami centais", () => {
    const result = parseTruckForm(OMNIVA_FORM);

    expect(result).toEqual({
      ok: true,
      value: {
        plate: "NNN 888",
        depreciation_cents: 5700,
        interest_cents: 0,
        insurance_kasko_cents: 400,
        insurance_civil_cents: 800,
        insurance_cmr_cents: 200,
        driver_salary_cents: 14500,
        per_diem_cents: 0,
        repairs_cents: 2800,
        management_cents: 0,
        trailer_monthly_cents: 55000,
        working_days_per_month: 22,
      },
    });
  });

  it("tuščios darbo dienos reiškia 22", () => {
    const result = parseTruckForm({ ...OMNIVA_FORM, working_days_per_month: "" });
    expect(result.ok && result.value.working_days_per_month).toBe(22);
  });

  it("rodo klaidą kiekvienam blogam laukui", () => {
    const result = parseTruckForm({
      ...OMNIVA_FORM,
      plate: "   ",
      repairs_cents: "-5",
      trailer_monthly_cents: "abc",
      working_days_per_month: "0",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(
        ["plate", "repairs_cents", "trailer_monthly_cents", "working_days_per_month"].sort(),
      );
    }
  });

  it("darbo dienos turi būti sveikas skaičius nuo 1 iki 31", () => {
    for (const bad of ["0", "32", "21.5", "abc"]) {
      const result = parseTruckForm({ ...OMNIVA_FORM, working_days_per_month: bad });
      expect(result.ok, bad).toBe(false);
    }
  });

  it("per ilgas numeris atmetamas", () => {
    expect(parseTruckForm({ ...OMNIVA_FORM, plate: "A".repeat(21) }).ok).toBe(false);
  });
});

describe("truckRowToCalc", () => {
  it("Omniva fura: paros savikaina 269,00 EUR", () => {
    const parsed = parseTruckForm(OMNIVA_FORM);
    if (!parsed.ok) throw new Error("forma turėjo būti teisinga");

    expect(calcDailyRate(truckRowToCalc(parsed.value))).toBe(26900);
  });

  it("kiekviena paros dedamoji patenka į skaičiavimą", () => {
    // Kiekvienai dedamajai skirtinga suma: jei bent viena būtų praleista ar
    // sukeista, suma nesutaptų.
    const parsed = parseTruckForm(OMNIVA_FORM);
    if (!parsed.ok) throw new Error("forma turėjo būti teisinga");
    const row = { ...parsed.value };
    const keys = Object.keys(DAILY_COSTS) as (keyof typeof DAILY_COSTS)[];
    keys.forEach((key, i) => {
      row[DAILY_COSTS[key].column] = 10 ** i;
    });

    const truck = truckRowToCalc(row);
    keys.forEach((key, i) => {
      expect(truck.dailyCents[key], key).toBe(10 ** i);
    });
  });
});

describe("truckRowToFormValues", () => {
  it("įrašyta fura grįžta į formą ir atgal nepakitusi", () => {
    // Taisymo kelias: eilutė -> forma -> eilutė. Jei čia kas nors pasimestų,
    // pataisius vien numerį pasikeistų ir paros savikaina.
    const parsed = parseTruckForm(OMNIVA_FORM);
    if (!parsed.ok) throw new Error("forma turėjo būti teisinga");

    expect(parseTruckForm(truckRowToFormValues(parsed.value))).toEqual({
      ok: true,
      value: parsed.value,
    });
  });

  it("nė vienas centas nepasimeta ties ribomis", () => {
    const parsed = parseTruckForm(OMNIVA_FORM);
    if (!parsed.ok) throw new Error("forma turėjo būti teisinga");

    for (const cents of [0, 1, 29, 999, 36000, 1204450, 2147483647]) {
      const row = { ...parsed.value, depreciation_cents: cents };
      const back = parseTruckForm(truckRowToFormValues(row));
      expect(back.ok && back.value.depreciation_cents, String(cents)).toBe(cents);
    }
  });

  it("užpildo visus formos laukus", () => {
    const parsed = parseTruckForm(OMNIVA_FORM);
    if (!parsed.ok) throw new Error("forma turėjo būti teisinga");

    const values = truckRowToFormValues(parsed.value);

    expect(Object.keys(values).sort()).toEqual([...TRUCK_FORM_FIELDS].sort());
  });
});

describe("formos laukai", () => {
  it("visi trucks stulpeliai, išskyrus id, yra formoje", () => {
    expect([...TRUCK_FORM_FIELDS].sort()).toEqual(Object.keys(OMNIVA_FORM).sort());
  });

  it("readTruckFormValues ignoruoja pašalinius laukus", () => {
    const formData = new FormData();
    formData.set("plate", "ABC 123");
    formData.set("$ACTION_ID_x", "");

    const values = readTruckFormValues(formData);

    expect(values.plate).toBe("ABC 123");
    expect(values.repairs_cents).toBe("");
    expect(Object.keys(values)).not.toContain("$ACTION_ID_x");
  });

  it("normalizePlate", () => {
    expect(normalizePlate("  abc   123 ")).toBe("ABC 123");
  });
});
