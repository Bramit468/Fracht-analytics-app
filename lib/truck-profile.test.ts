import { describe, expect, it } from "vitest";

import {
  daysUntil,
  documentAlerts,
  documentAlertText,
  parseTruckProfile,
  PROFILE_FIELD_NAMES,
  PROFILE_FIELDS,
  PROFILE_GROUPS,
  profileToFormValues,
} from "./truck-profile";

describe("parseTruckProfile", () => {
  it("tuščią kortelę paverčia null, o ne nuliais", () => {
    // „0 ašių“ ar „0000-00-00“ būtų netiesa: nežinomas dalykas lieka nežinomas.
    const { value, errors } = parseTruckProfile({});

    expect(errors).toEqual({});
    for (const field of PROFILE_FIELD_NAMES) {
      expect(value[field]).toBeNull();
    }
  });

  it("perskaito pilną kortelę", () => {
    const { value, errors } = parseTruckProfile({
      make: " Volvo ",
      model: "FH 500",
      manufacture_year: "2021",
      vin: "yv2 rtx0a5 lb123456",
      trailer_plate: " ab  123 ",
      euro_class: "EURO_6",
      axles: "5",
      fuel_type: "DIESEL",
      fuel_norm_l_per_100km: "27,5",
      adblue_norm_l_per_100km: "1,6",
      inspection_valid_until: "2027-03-15",
      insurance_valid_until: "2026-12-31",
      tachograph_calibration_until: "2027-08-01",
      notes: "Šaldytuvas Thermo King",
    });

    expect(errors).toEqual({});
    expect(value).toEqual({
      make: "Volvo",
      model: "FH 500",
      manufacture_year: 2021,
      vin: "YV2RTX0A5LB123456",
      trailer_plate: "AB 123",
      euro_class: "EURO_6",
      axles: 5,
      fuel_type: "DIESEL",
      fuel_norm_l_per_100km: 27.5,
      adblue_norm_l_per_100km: 1.6,
      inspection_valid_until: "2027-03-15",
      insurance_valid_until: "2026-12-31",
      tachograph_calibration_until: "2027-08-01",
      notes: "Šaldytuvas Thermo King",
    });
  });

  it("VIN be I, O ir Q", () => {
    // Standartas jų nenaudoja, kad nebūtų painiojami su 1 ir 0.
    expect(parseTruckProfile({ vin: "YV2RTX0A5LB12345O" }).errors.vin).toBeTruthy();
  });

  it("VIN turi būti 17 simbolių", () => {
    expect(parseTruckProfile({ vin: "YV2RTX0A5" }).errors.vin).toBeTruthy();
  });

  it("nepriima neegzistuojančios datos", () => {
    expect(parseTruckProfile({ insurance_valid_until: "2026-02-30" }).errors.insurance_valid_until).toBeTruthy();
  });

  it("EURO klasė tik iš sąrašo", () => {
    // Nuo jos priklauso kelių mokesčiai, todėl laisvo teksto čia būti negali.
    expect(parseTruckProfile({ euro_class: "EURO 6" }).errors.euro_class).toBeTruthy();
  });

  it("ašių skaičius sveikas ir protingose ribose", () => {
    expect(parseTruckProfile({ axles: "1" }).errors.axles).toBeTruthy();
    expect(parseTruckProfile({ axles: "4,5" }).errors.axles).toBeTruthy();
  });

  it("normą priima su kableliu", () => {
    expect(parseTruckProfile({ fuel_norm_l_per_100km: "26,75" }).value.fuel_norm_l_per_100km).toBe(26.75);
  });

  it("neleidžia neįtikėtinos normos", () => {
    expect(parseTruckProfile({ fuel_norm_l_per_100km: "270" }).errors.fuel_norm_l_per_100km).toBeTruthy();
  });

  it("grąžina visas klaidas iš karto", () => {
    const { errors } = parseTruckProfile({ vin: "x", axles: "99", euro_class: "x" });
    expect(Object.keys(errors).sort()).toEqual(["axles", "euro_class", "vin"]);
  });
});

describe("profileToFormValues", () => {
  it("nežinomą reikšmę rodo tuščiu lauku", () => {
    // Ir `null`, ir `undefined` (kai 0011 dar nepaleista) – tuščia, ne „null“.
    const values = profileToFormValues({ make: null });

    expect(values.make).toBe("");
    expect(values.vin).toBe("");
  });

  it("normą rašo su kableliu ir ji grįžta tuo pačiu skaičiumi", () => {
    const values = profileToFormValues({ fuel_norm_l_per_100km: 27.5 });

    expect(values.fuel_norm_l_per_100km).toBe("27,5");
    expect(parseTruckProfile(values).value.fuel_norm_l_per_100km).toBe(27.5);
  });
});

describe("daysUntil", () => {
  it("skaičiuoja likusias dienas", () => {
    expect(daysUntil("2026-10-31", "2026-10-01")).toBe(30);
  });

  it("praėjusią datą rodo minusu", () => {
    expect(daysUntil("2026-09-30", "2026-10-01")).toBe(-1);
  });

  it("nežinomos datos nespėja", () => {
    expect(daysUntil(null, "2026-10-01")).toBeNull();
    expect(daysUntil("ne data", "2026-10-01")).toBeNull();
  });
});

describe("documentAlerts", () => {
  const TODAY = "2026-10-01";

  it("įspėja apie dokumentus, kurie baigiasi per 30 dienų", () => {
    const alerts = documentAlerts(
      {
        inspection_valid_until: "2026-10-20",
        insurance_valid_until: "2027-05-01",
        tachograph_calibration_until: "2026-10-31",
      },
      TODAY,
    );

    expect(alerts.map((alert) => alert.label)).toEqual(["Techninė apžiūra", "Tachografas"]);
  });

  it("pasibaigusį rodo pirmą", () => {
    const alerts = documentAlerts(
      { inspection_valid_until: "2026-10-20", insurance_valid_until: "2026-09-28" },
      TODAY,
    );

    expect(alerts[0]).toEqual({ label: "Draudimas", days: -3 });
  });

  it("nežinomos datos neįspėja", () => {
    // Nežinoti nereiškia, kad pasibaigė; netikras įspėjimas mokytų jų nepaisyti.
    expect(documentAlerts({}, TODAY)).toEqual([]);
  });

  it("aprašo žodžiais", () => {
    expect(documentAlertText({ label: "Draudimas", days: -3 })).toBe("Draudimas pasibaigė prieš 3 d.");
    expect(documentAlertText({ label: "Tachografas", days: 0 })).toBe("Tachografas baigiasi šiandien");
    expect(documentAlertText({ label: "Techninė apžiūra", days: 12 })).toBe("Techninė apžiūra – po 12 d.");
  });
});

describe("PROFILE_FIELDS", () => {
  it("kiekvienas laukas priklauso esamai grupei", () => {
    const groups = new Set(PROFILE_GROUPS.map((group) => group.key));
    for (const field of PROFILE_FIELDS) {
      expect(groups.has(field.group)).toBe(true);
    }
  });
});
