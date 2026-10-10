import { describe, expect, it } from "vitest";

import { addDays, paymentState, paymentStateText, summarizePayments } from "./payments";

const TODAY = "2026-10-10";

describe("addDays", () => {
  it("pereina per mėnesio ir metų ribą", () => {
    expect(addDays("2026-09-15", 30)).toBe("2026-10-15");
    expect(addDays("2026-12-15", 30)).toBe("2027-01-14");
  });
});

describe("paymentState", () => {
  it("be sąskaitos – nėra nuo ko skaičiuoti", () => {
    expect(paymentState({ invoicedOn: null, paidOn: null, termsDays: 30 }, TODAY).status).toBe("not_invoiced");
  });

  it("terminas nepraėjęs – laukiama", () => {
    expect(paymentState({ invoicedOn: "2026-09-20", paidOn: null, termsDays: 30 }, TODAY)).toEqual({
      status: "open",
      dueOn: "2026-10-20",
      daysLate: null,
    });
  });

  it("terminas praėjęs – vėluoja tiek dienų", () => {
    // 2026-08-01 + 60 = 2026-09-30; šiandien 2026-10-10 – 10 d. po termino.
    expect(paymentState({ invoicedOn: "2026-08-01", paidOn: null, termsDays: 60 }, TODAY)).toEqual({
      status: "overdue",
      dueOn: "2026-09-30",
      daysLate: 10,
    });
  });

  it("termino dieną – dar ne vėluoja", () => {
    expect(paymentState({ invoicedOn: "2026-09-10", paidOn: null, termsDays: 30 }, TODAY).status).toBe("open");
  });

  it("be termino pradelsimo nespėja", () => {
    // Su klientu galėjo būti sutarta 60 dienų – „30 pagal nutylėjimą“ jį apkaltintų.
    expect(paymentState({ invoicedOn: "2026-01-01", paidOn: null, termsDays: null }, TODAY)).toEqual({
      status: "open",
      dueOn: null,
      daysLate: null,
    });
  });

  it("sumokėta po termino", () => {
    expect(paymentState({ invoicedOn: "2026-08-01", paidOn: "2026-09-05", termsDays: 30 }, TODAY)).toEqual({
      status: "paid_late",
      dueOn: "2026-08-31",
      daysLate: 5,
    });
  });

  it("sumokėta anksčiau – ne neigiamas vėlavimas", () => {
    expect(paymentState({ invoicedOn: "2026-08-01", paidOn: "2026-08-10", termsDays: 30 }, TODAY)).toMatchObject({
      status: "paid",
      daysLate: 0,
    });
  });
});

describe("summarizePayments", () => {
  it("sudeda neapmokėtas ir pradelstas sumas", () => {
    const summary = summarizePayments(
      [
        { invoicedOn: "2026-08-01", paidOn: null, termsDays: 30, revenueCents: 100000 }, // vėluoja
        { invoicedOn: "2026-10-01", paidOn: null, termsDays: 30, revenueCents: 50000 }, // laukiama
        { invoicedOn: null, paidOn: null, termsDays: 30, revenueCents: 70000 }, // neišrašyta
      ],
      TODAY,
    );

    expect(summary).toMatchObject({ openCents: 150000, overdueCents: 100000, overdueCount: 1 });
  });

  it("vidutinį apmokėjimo laiką sveria suma", () => {
    // 10 d. už 100 € ir 90 d. už 900 € – 82 d., o ne paprastas vidurkis 50 d.
    const summary = summarizePayments(
      [
        { invoicedOn: "2026-06-01", paidOn: "2026-06-11", termsDays: 30, revenueCents: 10000 },
        { invoicedOn: "2026-06-01", paidOn: "2026-08-30", termsDays: 30, revenueCents: 90000 },
      ],
      TODAY,
    );

    expect(summary.avgDaysToPay).toBeCloseTo(82);
    expect(summary).toMatchObject({ paidCount: 2, paidLateCount: 1 });
  });

  it("be apmokėtų – vidurkio nėra", () => {
    expect(summarizePayments([], TODAY).avgDaysToPay).toBeNull();
  });
});

describe("paymentStateText", () => {
  it("aprašo žodžiais", () => {
    expect(paymentStateText({ status: "overdue", dueOn: "2026-09-30", daysLate: 10 })).toBe("Vėluoja 10 d.");
    expect(paymentStateText({ status: "not_invoiced", dueOn: null, daysLate: null })).toBeNull();
  });
});
