import { describe, expect, it } from "vitest";

import type { DailyDistance } from "./telematics-costs";
import { addDays, isOnTheRoad, tripProgress } from "./trip-progress";

const DAILY: DailyDistance[] = [
  { plate: "LOV 141", date: "2026-09-21", km: 480, fuelL: 130 },
  { plate: "LOV 141", date: "2026-09-22", km: 520, fuelL: 140 },
  // Kita fura tomis pačiomis dienomis – į sumą patekti neturi.
  { plate: "LSE 728", date: "2026-09-21", km: 300, fuelL: 80 },
  // Diena už reiso ribų.
  { plate: "LOV 141", date: "2026-09-25", km: 700, fuelL: 190 },
];

describe("isOnTheRoad", () => {
  it("vienos paros reisas vyksta savo dieną", () => {
    expect(isOnTheRoad("2026-09-21", 1, "2026-09-21")).toBe(true);
    expect(isOnTheRoad("2026-09-21", 1, "2026-09-22")).toBe(false);
  });

  it("ribos imtinės", () => {
    expect(isOnTheRoad("2026-09-21", 4, "2026-09-24")).toBe(true);
    expect(isOnTheRoad("2026-09-21", 4, "2026-09-25")).toBe(false);
    expect(isOnTheRoad("2026-09-21", 4, "2026-09-20")).toBe(false);
  });

  it("be trukmės reisas nevyksta", () => {
    expect(isOnTheRoad("2026-09-21", 0, "2026-09-21")).toBe(false);
  });
});

describe("tripProgress", () => {
  const progress = () =>
    tripProgress(DAILY, "LOV 141", "2026-09-21", 4, 2060, 26900, "2026-09-23");

  it("sudeda tik tos furos ir to reiso dienas", () => {
    // LSE 728 ir rugsėjo 25-oji į sumą nepatenka.
    expect(progress().drivenKm).toBe(1000);
  });

  it("skaičiuoja likutį iš planuotų km", () => {
    expect(progress().remainingKm).toBe(1060);
  });

  it("nuvažiavus daugiau nei planuota, likutis yra nulis", () => {
    // Neigiamas likutis atrodytų kaip klaida; realiai tai reiškia, kad
    // planas buvo per mažas.
    const daug = tripProgress(DAILY, "LOV 141", "2026-09-21", 4, 500, 26900, "2026-09-23");
    expect(daug.remainingKm).toBe(0);
  });

  it("rodo, kelinta para šiandien", () => {
    expect(progress()).toMatchObject({ dayNow: 3, daysTotal: 4 });
  });

  it("furos kaštai skaičiuojami už prasidėjusias paras", () => {
    // Trečia para jau prasidėjusi, nors trečios dienos matavimų dar nėra:
    // fura kainuoja nuo išvažiavimo, o ne nuo tiekėjo eilutės.
    expect(progress().truckCostSoFarCents).toBe(26900 * 3);
  });

  it("sako, iki kurios dienos turime matavimus", () => {
    // Šiandienos eilutė atsiras rytoj, todėl skaičiai tikslūs iki vakar.
    expect(progress().measuredThrough).toBe("2026-09-22");
  });

  it("skaičiuoja faktines sąnaudas", () => {
    // 270 l / 1000 km = 27 l/100 km.
    expect(progress().litresPer100Km).toBe(27);
  });

  it("dar nevažiavus sąnaudų nėra, o ne nulis", () => {
    // Nulis reikštų „degina 0 l/100", o čia tiesiog nežinoma.
    const pradzia = tripProgress(DAILY, "LOV 141", "2026-09-30", 3, 800, 26900, "2026-09-30");

    expect(pradzia.litresPer100Km).toBeNull();
    expect(pradzia.drivenKm).toBe(0);
    expect(pradzia.measuredThrough).toBeNull();
    expect(pradzia.dayNow).toBe(1);
  });

  it("paskutinę dieną neperšoka trukmės", () => {
    const pabaiga = tripProgress(DAILY, "LOV 141", "2026-09-21", 4, 2060, 26900, "2026-09-24");
    expect(pabaiga.dayNow).toBe(4);
  });
});

describe("addDays", () => {
  it("prideda paras", () => {
    expect(addDays("2026-09-21", 3)).toBe("2026-09-24");
  });

  it("peršoka mėnesio ribą", () => {
    expect(addDays("2026-09-29", 3)).toBe("2026-10-02");
  });

  it("netinkamą datą palieka kaip yra", () => {
    expect(addDays("ne data", 3)).toBe("ne data");
  });
});
