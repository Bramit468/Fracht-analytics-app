import { describe, expect, it } from "vitest";

import type { DailyDistance } from "./telematics-costs";
import { addDays, fuelDrift, isOnTheRoad, tripProgress } from "./trip-progress";

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

describe("fuelDrift", () => {
  it("skaičiuoja perviršį nuvažiuotuose kilometruose", () => {
    // 1000 km × 4 l/100 = 40 l × 1,24 € = 49,60 €.
    const drift = fuelDrift(31, 27, 1.24, 1000, 2060);

    expect(drift?.soFarCents).toBe(4960);
    expect(drift?.litresPer100KmDiff).toBe(4);
  });

  it("prognozuoja visą reisą", () => {
    // 2060 km × 4 l/100 × 1,24 € = 102,18 €.
    expect(fuelDrift(31, 27, 1.24, 1000, 2060)?.projectedCents).toBe(10218);
  });

  it("taupesnę furą rodo minusu", () => {
    // Mažesnės sąnaudos nei norma yra sutaupyti pinigai, ne klaida.
    expect(fuelDrift(25, 27, 1.24, 1000, 1000)?.soFarCents).toBeLessThan(0);
  });

  it("nuvažiavus daugiau nei planuota, ima tikrus kilometrus", () => {
    // Jų jau neatsuksi, tad prognozė negali būti mažesnė už tai, kas įvyko.
    const drift = fuelDrift(31, 27, 1.24, 2500, 2060);
    expect(drift?.projectedCents).toBe(drift?.soFarCents);
  });

  it("be faktinių sąnaudų nespėja", () => {
    expect(fuelDrift(null, 27, 1.24, 1000, 2060)).toBeNull();
  });

  it("be normos ar kainos nespėja", () => {
    expect(fuelDrift(31, 0, 1.24, 1000, 2060)).toBeNull();
    expect(fuelDrift(31, 27, 0, 1000, 2060)).toBeNull();
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
