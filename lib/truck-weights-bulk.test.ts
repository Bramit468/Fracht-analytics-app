import { describe, expect, it } from "vitest";

import {
  fillEmptyWeights,
  parseBulkWeights,
  readBulkWeightValues,
  trucksMissingWeights,
  weightFieldName,
} from "./truck-weights-bulk";
import type { Truck } from "../types/truck";

function truck(id: string, plate: string, overrides: Partial<Truck> = {}): Truck {
  return {
    id,
    plate,
    depreciation_cents: 5000,
    interest_cents: 1000,
    insurance_kasko_cents: 800,
    insurance_civil_cents: 200,
    insurance_cmr_cents: 300,
    driver_salary_cents: 9000,
    per_diem_cents: 5500,
    repairs_cents: 2500,
    management_cents: 1500,
    trailer_monthly_cents: 40000,
    working_days_per_month: 22,
    empty_weight_kg: null,
    total_permitted_weight_kg: null,
    ...overrides,
  };
}

describe("readBulkWeightValues", () => {
  it("paima tik turimų furų laukus", () => {
    const formData = new FormData();
    formData.set(weightFieldName("a", "empty_weight_kg"), "15000");
    formData.set(weightFieldName("b", "empty_weight_kg"), "99000");

    const values = readBulkWeightValues(formData, [truck("a", "LOV 141")]);

    expect(Object.keys(values)).toEqual(["a"]);
    expect(values.a.empty_weight_kg).toBe("15000");
    expect(values.a.total_permitted_weight_kg).toBe("");
  });
});

describe("parseBulkWeights", () => {
  const first = truck("a", "LOV 141");
  const second = truck("b", "LSE 728", { empty_weight_kg: 15000, total_permitted_weight_kg: 40000 });

  it("įrašo tik pasikeitusias eilutes", () => {
    const values = {
      a: { empty_weight_kg: "15000", total_permitted_weight_kg: "40000" },
      b: { empty_weight_kg: "15000", total_permitted_weight_kg: "40000" },
    };

    const { updates } = parseBulkWeights(values, [first, second]);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      id: "a",
      plate: "LOV 141",
      value: { empty_weight_kg: 15000, total_permitted_weight_kg: 40000 },
    });
  });

  it("į atnaujinimą kaštų nededa", () => {
    const values = { a: { empty_weight_kg: "15000", total_permitted_weight_kg: "40000" } };
    const { updates } = parseBulkWeights(values, [first]);

    expect(Object.keys(updates[0].value).sort()).toEqual([
      "empty_weight_kg",
      "total_permitted_weight_kg",
    ]);
  });

  it("tuščias laukas reiškia „nežinoma“, ne nulį", () => {
    const values = { b: { empty_weight_kg: "", total_permitted_weight_kg: "" } };
    const { updates } = parseBulkWeights(values, [second]);

    expect(updates[0].value.empty_weight_kg).toBeNull();
  });

  it("klaidą priskiria tai furai, kurioje ji yra", () => {
    const values = {
      a: { empty_weight_kg: "15", total_permitted_weight_kg: "40000" },
      b: { empty_weight_kg: "16000", total_permitted_weight_kg: "40000" },
    };

    const { updates, errors } = parseBulkWeights(values, [first, second]);

    expect(errors.a?.empty_weight_kg).toBeTruthy();
    expect(errors.b).toBeUndefined();
    // Tvarkinga eilutė dėl svetimos klaidos neprarandama.
    expect(updates.map((row) => row.id)).toEqual(["b"]);
  });

  it("neleidžia tuščiam vilkikui sverti daugiau už leistiną masę", () => {
    const values = { a: { empty_weight_kg: "45000", total_permitted_weight_kg: "40000" } };
    const { errors, updates } = parseBulkWeights(values, [first]);

    expect(errors.a?.empty_weight_kg).toBeTruthy();
    expect(updates).toEqual([]);
  });
});

describe("trucksMissingWeights", () => {
  it("randa furas be svorių", () => {
    const pilna = truck("b", "LSE 728", { empty_weight_kg: 15000, total_permitted_weight_kg: 40000 });
    const puse = truck("c", "NNN 888", { empty_weight_kg: 15000 });

    const missing = trucksMissingWeights([truck("a", "LOV 141"), pilna, puse]);

    expect(missing.map((row) => row.id)).toEqual(["a", "c"]);
  });
});

describe("fillEmptyWeights", () => {
  it("užpildo tik tuščius laukus", () => {
    // Suvesti svoriai suvesti sąmoningai; parko „vidurkis“ juos sugadintų.
    const values = {
      a: { empty_weight_kg: "", total_permitted_weight_kg: "" },
      b: { empty_weight_kg: "17000", total_permitted_weight_kg: "" },
    };

    const filled = fillEmptyWeights(values, {
      empty_weight_kg: "15000",
      total_permitted_weight_kg: "40000",
    });

    expect(filled.a).toEqual({ empty_weight_kg: "15000", total_permitted_weight_kg: "40000" });
    expect(filled.b).toEqual({ empty_weight_kg: "17000", total_permitted_weight_kg: "40000" });
  });
});
