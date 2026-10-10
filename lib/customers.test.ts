import { describe, expect, it } from "vitest";

import {
  customerKey,
  findCustomer,
  NO_CUSTOMER_LABEL,
  normalizeCustomerName,
  parseCustomerName,
  parsePaymentTerms,
  paymentsByCustomer,
  summarizeByCustomer,
} from "./customers";
import type { TripSummary } from "./trips";

function trip(overrides: Partial<TripSummary>): TripSummary {
  return {
    id: "t",
    tripNumber: "LT1",
    origin: "Vilnius",
    destination: "Oslas",
    tripDate: "2026-09-01",
    truckPlate: "AAA 001",
    customerId: null,
    paidKm: 1000,
    days: 2,
    emptyKm: 0,
    emptyFuelCents: 0,
    revenueCents: 100000,
    totalCostCents: 80000,
    profitCents: 20000,
    marginPercent: 20,
    profitPerKm: 0.2,
    profitPerDayCents: 10000,
    roadByCountry: [],
    ...overrides,
  };
}

const CUSTOMERS = [
  { id: "c1", name: "UAB Omniva" },
  { id: "c2", name: "Girteka" },
];

describe("užsakovo pavadinimas", () => {
  it("sutvarko tarpus", () => {
    expect(normalizeCustomerName("  UAB   Omniva ")).toBe("UAB Omniva");
  });

  it("tuščias – reisas be užsakovo", () => {
    expect(parseCustomerName("   ")).toEqual({ ok: true, value: null });
  });

  it("per ilgo nepriima", () => {
    expect(parseCustomerName("x".repeat(201)).ok).toBe(false);
  });

  it("didžiosios raidės ir tarpai – tas pats užsakovas", () => {
    // Kitaip vienas klientas pasidalintų į kelis, ir jo pelnas taip pat.
    expect(customerKey("UAB  Omniva")).toBe(customerKey("uab omniva"));
    expect(findCustomer(CUSTOMERS, " uab   OMNIVA ")?.id).toBe("c1");
  });

  it("lietuviškas raides lygina teisingai", () => {
    expect(customerKey("ŠILAS")).toBe(customerKey("šilas"));
  });

  it("nežinomo neranda", () => {
    expect(findCustomer(CUSTOMERS, "Nauja įmonė")).toBeNull();
  });
});

describe("paymentsByCustomer", () => {
  it("naudoja užsakovo terminą ir praleidžia reisus be užsakovo", () => {
    const result = paymentsByCustomer(
      [
        trip({ customerId: "c1", invoicedOn: "2026-08-01", paidOn: null, revenueCents: 100000 }),
        trip({ customerId: null, invoicedOn: "2026-01-01", paidOn: null, revenueCents: 999999 }),
      ],
      [{ id: "c1", name: "UAB Omniva", payment_terms_days: 30 }],
      "2026-10-10",
    );

    expect(result.size).toBe(1);
    expect(result.get("c1")).toMatchObject({ openCents: 100000, overdueCents: 100000, overdueCount: 1 });
  });

  it("be termino – laukiama, bet nepradelsta", () => {
    const result = paymentsByCustomer(
      [trip({ customerId: "c2", invoicedOn: "2026-01-01", paidOn: null })],
      CUSTOMERS,
      "2026-10-10",
    );
    expect(result.get("c2")).toMatchObject({ openCents: 100000, overdueCents: 0 });
  });
});

describe("parsePaymentTerms", () => {
  it("tuščias – nežinomas, sveikas skaičius – dienos", () => {
    expect(parsePaymentTerms("")).toEqual({ ok: true, value: null });
    expect(parsePaymentTerms(" 60 ")).toEqual({ ok: true, value: 60 });
  });

  it("atmeta trupmenas ir per ilgus terminus", () => {
    expect(parsePaymentTerms("30,5").ok).toBe(false);
    expect(parsePaymentTerms("400").ok).toBe(false);
  });
});

describe("summarizeByCustomer", () => {
  it("sudeda užsakovo reisus nuo bendrų sumų", () => {
    const rows = summarizeByCustomer(
      [
        trip({ customerId: "c1", profitCents: 20000, revenueCents: 100000, days: 2 }),
        trip({ customerId: "c1", profitCents: -5000, revenueCents: 50000, days: 3 }),
        trip({ customerId: "c2", profitCents: 1000, revenueCents: 10000, days: 1 }),
      ],
      CUSTOMERS,
    );

    expect(rows[0]).toMatchObject({ name: "UAB Omniva", tripCount: 2, profitCents: 15000, revenueCents: 150000 });
    // 15 000 / 150 000 = 10 %, o ne maržų vidurkis.
    expect(rows[0].marginPercent).toBeCloseTo(10);
    expect(rows[0].profitPerDayCents).toBe(3000);
  });

  it("reisai be užsakovo – atskira eilutė gale, net jei pelningiausi", () => {
    const rows = summarizeByCustomer(
      [trip({ customerId: null, profitCents: 99999 }), trip({ customerId: "c2", profitCents: 100 })],
      CUSTOMERS,
    );

    expect(rows.map((row) => row.name)).toEqual(["Girteka", NO_CUSTOMER_LABEL]);
    expect(rows[1].customerId).toBeNull();
  });

  it("seni reisai be lauko – irgi be užsakovo", () => {
    const old = trip({});
    delete old.customerId;
    expect(summarizeByCustomer([old], CUSTOMERS)[0].name).toBe(NO_CUSTOMER_LABEL);
  });
});
