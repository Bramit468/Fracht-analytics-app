import { describe, expect, it } from "vitest";

import { calcDedicated, parseDedicatedForm, sensitivity, suggestPrice, type DedicatedOfferInsert } from "./dedicated";

/** 262,08 €/parą fura, 10 000 km/mėn., kuras 30 l × 1,40, AdBlue 2 l × 0,80, keliai 0,15 €/km. */
const OFFER: DedicatedOfferInsert = {
  title: "Testas",
  customer: null,
  truck_id: null,
  status: "draft",
  truck_daily_cents: 26208,
  paid_km_month: 10000,
  empty_km_month: 0,
  fuel_l_per_100km: 30,
  fuel_price: 1.4,
  adblue_l_per_100km: 2,
  adblue_price: 0.8,
  toll_per_km: 0.15,
  pricing_model: "km_with_min",
  monthly_fee_cents: 0,
  rate_per_km: 1.4,
  min_km_month: 9000,
  margin_percent: 15,
  terms: {},
  notes: null,
};

describe("calcDedicated", () => {
  it("fura kainuoja visą kalendorinį mėnesį", () => {
    const result = calcDedicated(OFFER);
    // 262,08 × 365 / 12 = 7 971,60 €; kuras 4 200, AdBlue 160, keliai 1 500.
    expect(result).toMatchObject({
      truckCents: 797160,
      fuelCents: 420000,
      adblueCents: 16000,
      tollCents: 150000,
      totalCostCents: 1383160,
      revenueCents: 1400000,
      profitCents: 16840,
    });
  });

  it("lūžio taškas: kiek km reikia, kad €/km padengtų furos mėnesį", () => {
    // 7 971,60 / (1,40 − 0,586) = 9 793,1 → 9 794 km
    expect(calcDedicated(OFFER).breakEvenKm).toBe(9794);
  });

  it("nesurinkus minimumo užsakovas moka už minimumą", () => {
    const result = calcDedicated({ ...OFFER, paid_km_month: 7000 });
    expect(result.revenueCents).toBe(1260000);
  });

  it("jei sutarta mokėti tik už faktą, minimumas nesaugo", () => {
    const result = calcDedicated({ ...OFFER, paid_km_month: 7000, terms: { minimum: "Moka tik už faktą" } });
    expect(result.revenueCents).toBe(980000);
  });

  it("užsakovo kuras ir perstatomi keliai į mūsų kaštus nepatenka", () => {
    const result = calcDedicated({ ...OFFER, terms: { fuel: "Apmoka užsakovas", tolls: "Perstatomi pagal faktą" } });
    expect(result.totalCostCents).toBe(797160);
  });

  it("tušti km apmokami tik tada, kai taip sutarta", () => {
    const withEmpty = { ...OFFER, empty_km_month: 1000 };
    expect(calcDedicated(withEmpty).billableKm).toBe(10000);
    expect(calcDedicated({ ...withEmpty, terms: { empty_km: "Apmokami" } }).billableKm).toBe(11000);
  });

  it("fiksuotas mokestis + €/km", () => {
    const result = calcDedicated({ ...OFFER, pricing_model: "fixed_plus_km", monthly_fee_cents: 800000, rate_per_km: 0.7 });
    expect(result.revenueCents).toBe(1500000);
    // Mokestis jau dengia furą – lūžio taškas nulis.
    expect(result.breakEvenKm).toBe(0);
  });

  it("kai €/km nepadengia net kuro ir kelių, lūžio taško nėra", () => {
    expect(calcDedicated({ ...OFFER, rate_per_km: 0.5 }).breakEvenKm).toBeNull();
  });
});

describe("suggestPrice", () => {
  it("fiksuotas mokestis dengia furą, €/km – kintamus kaštus", () => {
    const price = suggestPrice({ ...OFFER, pricing_model: "fixed_plus_km" }, 20);
    expect(price.monthlyFeeCents).toBe(996450);
    expect(price.ratePerKm).toBeCloseTo(0.7325, 6);
  });

  it("tik €/km: kaina ir mažiausias minimumas", () => {
    const price = suggestPrice(OFFER, 20);
    // 13 831,60 / 0,8 / 10 000 = 1,72895 €/km
    expect(price.ratePerKm).toBeCloseTo(1.72895, 5);
    expect(price.minKm).toBe(Math.ceil(7971.6 / (1.72895 - 0.586)));
  });
});

describe("sensitivity", () => {
  it("rodo pelną, jei apkraus mažiau ar daugiau", () => {
    const rows = sensitivity({ ...OFFER, terms: { minimum: "Moka tik už faktą" } }, [0.5, 1]);
    expect(rows[0].profitCents).toBeLessThan(0);
    expect(rows[1].profitCents).toBe(16840);
  });
});

describe("parseDedicatedForm", () => {
  const form = {
    title: " Omniva Kaunas–Ryga ",
    pricing_model: "km_with_min",
    truck_daily_cents: "262,08",
    paid_km_month: "10 000",
    fuel_l_per_100km: "30",
    fuel_price: "1,40",
    rate_per_km: "1,4",
    min_km_month: "9000",
    margin_percent: "15",
    term_fuel: "Apmoka užsakovas",
    term_payment: "45 d.",
  };

  it("perskaito formą", () => {
    const parsed = parseDedicatedForm(form);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toMatchObject({
      title: "Omniva Kaunas–Ryga",
      truck_daily_cents: 26208,
      paid_km_month: 10000,
      fuel_price: 1.4,
      status: "draft",
      terms: { fuel: "Apmoka užsakovas", payment: "45 d." },
    });
  });

  it("atmeta atsakymą ne iš sąrašo ir trūkstamus laukus", () => {
    const parsed = parseDedicatedForm({ ...form, title: "", term_fuel: "Kažkas", paid_km_month: "", pricing_model: "x" });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(Object.keys(parsed.errors).sort()).toEqual(["paid_km_month", "pricing_model", "term_fuel", "title"]);
  });
});
