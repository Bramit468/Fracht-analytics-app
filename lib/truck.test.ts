import { describe, expect, it } from "vitest";

import { calcDailyRate } from "./calc";
import {
  DAILY_COSTS,
  TRUCK_FORM_FIELDS,
  isMissingColumnError,
  normalizePlate,
  parseTruckForm,
  readTruckFormValues,
  truckPayload,
  truckRowToCalc,
  truckRowToFormValues,
  type TruckFormValues,
} from "./truck";
import { PROFILE_FIELD_NAMES } from "./truck-profile";

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
  // Svoriai nežinomi: forma turi juos priimti tuščius (#86).
  empty_weight_kg: "",
  total_permitted_weight_kg: "",
  // Kortelė neužpildyta – taip, kaip ją siunčia nepaliesta forma (#164).
  ...Object.fromEntries(PROFILE_FIELD_NAMES.map((field) => [field, ""])),
};

/** Neužpildyta kortelė po patikros: visi laukai `null`, ne tuščias tekstas. */
const EMPTY_PROFILE = Object.fromEntries(PROFILE_FIELD_NAMES.map((field) => [field, null]));

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
        empty_weight_kg: null,
        total_permitted_weight_kg: null,
        ...EMPTY_PROFILE,
      },
    });
  });

  it("nežinomas svoris lieka null, o ne nulis", () => {
    // Nulinis svoris PTV duotų tikslų atrodantį, bet prasimanytą kuro skaičių.
    const result = parseTruckForm(OMNIVA_FORM);
    expect(result.ok && result.value.empty_weight_kg).toBeNull();
  });

  it("priima svorius kilogramais", () => {
    const result = parseTruckForm({
      ...OMNIVA_FORM,
      empty_weight_kg: "15000",
      total_permitted_weight_kg: "40000",
    });

    expect(result.ok && result.value).toMatchObject({
      empty_weight_kg: 15000,
      total_permitted_weight_kg: 40000,
    });
  });

  it("neleidžia tuščiam vilkikui sverti daugiau už leistiną masę", () => {
    const result = parseTruckForm({
      ...OMNIVA_FORM,
      empty_weight_kg: "45000",
      total_permitted_weight_kg: "40000",
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.empty_weight_kg).toBeTruthy();
  });

  it("neleidžia neįtikėtino svorio", () => {
    const result = parseTruckForm({ ...OMNIVA_FORM, empty_weight_kg: "15" });
    expect(!result.ok && result.errors.empty_weight_kg).toBeTruthy();
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

describe("truckPayload", () => {
  const parsed = parseTruckForm(OMNIVA_FORM);
  if (!parsed.ok) throw new Error("Omniva forma turi būti tvarkinga");
  const value = parsed.value;

  it("kuriant furą tuščių svorių nesiunčia", () => {
    // Kol migracija 0010 nepaleista, nežinomas stulpelis atmestų visą įrašą,
    // o tuščias svoris ir taip yra numatytoji reikšmė.
    const payload = truckPayload(value, null);

    expect(payload).not.toHaveProperty("empty_weight_kg");
    expect(payload).not.toHaveProperty("total_permitted_weight_kg");
    expect(payload.plate).toBe("NNN 888");
  });

  it("įvestą svorį siunčia", () => {
    const payload = truckPayload({ ...value, empty_weight_kg: 15000 }, null);
    expect(payload.empty_weight_kg).toBe(15000);
  });

  it("taisant be stulpelio tuščio svorio nesiunčia", () => {
    const payload = truckPayload(value, new Set(["id", "plate"]));
    expect(payload).not.toHaveProperty("empty_weight_kg");
  });

  it("taisant su stulpeliu tuščią svorį siunčia, kad jis išsivalytų", () => {
    // Kitaip išvalytas svoris tyliai liktų senas, ir PTV skaičiuotų pagal jį.
    const payload = truckPayload(value, new Set(["id", "plate", "empty_weight_kg"]));

    expect(payload).toHaveProperty("empty_weight_kg", null);
    expect(payload).not.toHaveProperty("total_permitted_weight_kg");
  });

  it("kaštų niekada neišmeta", () => {
    const payload = truckPayload(value, null);
    expect(payload.driver_salary_cents).toBe(14500);
  });
});

describe("isMissingColumnError", () => {
  it("atpažįsta Postgres ir PostgREST stulpelio klaidas", () => {
    expect(isMissingColumnError({ code: "42703" })).toBe(true);
    expect(isMissingColumnError({ code: "PGRST204" })).toBe(true);
  });

  it("kitų klaidų nelaiko trūkstamu stulpeliu", () => {
    expect(isMissingColumnError({ code: "23505" })).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
  });
});

describe("truckRowToFormValues be 0010 stulpelių", () => {
  it("nerašo „undefined“ į svorio lauką", () => {
    const parsedRow = parseTruckForm(OMNIVA_FORM);
    if (!parsedRow.ok) throw new Error("Omniva forma turi būti tvarkinga");
    // Eilutė tokia, kokią grąžina duomenų bazė be 0010: svorių raktų nėra visai.
    const beSvoriu: Record<string, unknown> = { ...parsedRow.value };
    delete beSvoriu.empty_weight_kg;
    delete beSvoriu.total_permitted_weight_kg;

    const values = truckRowToFormValues(beSvoriu as typeof parsedRow.value);
    expect(values.empty_weight_kg).toBe("");
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
