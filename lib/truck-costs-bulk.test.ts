import { describe, expect, it } from "vitest";

import {
  copiedTruckIds,
  costFieldName,
  costLabel,
  COST_SHORT_LABELS,
  parseBulkCosts,
  readBulkCostValues,
  TRUCK_COST_FIELDS,
} from "./truck-costs-bulk";
import { truckRowToFormValues } from "./truck";
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

/** Eilutė su esamomis reikšmėmis — toks pavidalas ateina iš formos. */
function rowFor(row: Truck) {
  return truckRowToFormValues(row);
}

describe("TRUCK_COST_FIELDS", () => {
  it("numerio neredaguoja", () => {
    expect(TRUCK_COST_FIELDS).not.toContain("plate");
  });

  it("apima visus kaštų laukus", () => {
    expect(TRUCK_COST_FIELDS).toHaveLength(11);
  });

  it("kiekvienas laukas turi trumpą ir pilną pavadinimą", () => {
    // Pridėjus naują kaštų stulpelį, antraštė lentelėje neliks tuščia.
    for (const field of TRUCK_COST_FIELDS) {
      expect(COST_SHORT_LABELS[field]).toBeTruthy();
      expect(costLabel(field)).not.toBe(field);
    }
  });
});

describe("readBulkCostValues", () => {
  it("paima tik turimų furų laukus", () => {
    const one = truck("a", "LOV 141");
    const formData = new FormData();
    formData.set(costFieldName("a", "depreciation_cents"), "60");
    // Svetima fura: į rezultatą patekti neturi.
    formData.set(costFieldName("b", "depreciation_cents"), "99");

    const values = readBulkCostValues(formData, [one]);

    expect(Object.keys(values)).toEqual(["a"]);
    expect(values.a.depreciation_cents).toBe("60");
  });

  it("trūkstamą lauką paverčia tuščiu tekstu", () => {
    const values = readBulkCostValues(new FormData(), [truck("a", "LOV 141")]);
    expect(values.a.repairs_cents).toBe("");
  });
});

describe("parseBulkCosts", () => {
  const first = truck("a", "LOV 141");
  const second = truck("b", "LSE 728");

  it("nepaliestų furų neatnaujina", () => {
    // Perrašius nepakeistas eilutes, dingtų skirtumas tarp „patikslinta" ir
    // „tiesiog išsaugota".
    const values = { a: rowFor(first), b: rowFor(second) };
    expect(parseBulkCosts(values, [first, second]).updates).toEqual([]);
  });

  it("grąžina tik pakeistą eilutę", () => {
    const values = {
      a: { ...rowFor(first), driver_salary_cents: "120" },
      b: rowFor(second),
    };

    const { updates } = parseBulkCosts(values, [first, second]);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ id: "a", plate: "LOV 141" });
    expect(updates[0].value.driver_salary_cents).toBe(12000);
  });

  it("į atnaujinimą numerio nededa", () => {
    const values = { a: { ...rowFor(first), repairs_cents: "30" } };
    const { updates } = parseBulkCosts(values, [first]);

    expect(updates[0].value).not.toHaveProperty("plate");
  });

  it("klaidą priskiria tai furai, kurioje ji yra", () => {
    const values = {
      a: { ...rowFor(first), repairs_cents: "trisdešimt" },
      b: { ...rowFor(second), driver_salary_cents: "95" },
    };

    const { updates, errors } = parseBulkCosts(values, [first, second]);

    expect(errors.a?.repairs_cents).toBeTruthy();
    expect(errors.b).toBeUndefined();
    // Tvarkinga eilutė dėl svetimos klaidos neprarandama.
    expect(updates.map((update) => update.id)).toEqual(["b"]);
  });

  it("tuščias laukas reiškia nulį", () => {
    const values = { a: { ...rowFor(first), management_cents: "" } };
    const { updates } = parseBulkCosts(values, [first]);

    expect(updates[0].value.management_cents).toBe(0);
  });
});

describe("copiedTruckIds", () => {
  it("randa furas su iki cento vienodais kaštais", () => {
    const copied = copiedTruckIds([
      truck("a", "LOV 141"),
      truck("b", "LSE 728"),
      truck("c", "NNN 888", { driver_salary_cents: 9500 }),
    ]);

    expect([...copied].sort()).toEqual(["a", "b"]);
  });

  it("vieno cento skirtumas jau yra patikslinimas", () => {
    const copied = copiedTruckIds([
      truck("a", "LOV 141"),
      truck("b", "LSE 728", { repairs_cents: 2501 }),
    ]);

    expect(copied.size).toBe(0);
  });

  it("vienos furos parke nieko nežymi", () => {
    expect(copiedTruckIds([truck("a", "LOV 141")]).size).toBe(0);
  });
});
