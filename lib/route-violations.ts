/**
 * Kur maršrute yra apribojimas (#193).
 *
 * PTV visą kelią parenka aplenkdamas draudimus, bet paskutinių kilometrų iki
 * taško, esančio draudžiamoje zonoje, aplenkti negali – nuveda ir pažymi
 * pažeidimą. Žmogui tai atrodė kaip „veda ten, kur pats sako, kad negalima“.
 * Iš tikrųjų problema – adresas (dažniausiai įrašytas tik miestas, ir taškas
 * stovi centre), todėl pažeidimai prie pradžios ar pabaigos rodomi kaip
 * pakrovimo ar iškrovimo vietos problema, o ne maršruto.
 */

import type { RouteViolation } from "./ptv-route";

/** Tiek km nuo taško pažeidimas dar laikomas to taško aplinka. */
export const NEAR_STOP_KM = 15;

export type ViolationPlace = "start" | "end" | "route";

export interface ViolationGroup {
  place: ViolationPlace;
  violations: RouteViolation[];
}

export function violationPlace(distanceKm: number, totalKm: number | null): ViolationPlace {
  if (distanceKm <= NEAR_STOP_KM) return "start";
  if (totalKm !== null && totalKm > 0 && totalKm - distanceKm <= NEAR_STOP_KM) return "end";
  return "route";
}

/** Pažeidimai sugrupuoti: pakrovimo vieta, iškrovimo vieta, pats maršrutas. */
export function groupViolations(violations: RouteViolation[], totalKm: number | null): ViolationGroup[] {
  const order: ViolationPlace[] = ["start", "end", "route"];
  return order
    .map((place) => ({
      place,
      violations: violations.filter((violation) => violationPlace(violation.distanceKm, totalKm) === place),
    }))
    .filter((group) => group.violations.length > 0);
}

export const VIOLATION_HEADINGS: Record<ViolationPlace, string> = {
  start: "Pakrovimo vieta yra zonoje su apribojimais",
  end: "Iškrovimo vieta yra zonoje su apribojimais",
  route: "Maršrute yra apribojimų",
};

export const VIOLATION_ADVICE: Record<ViolationPlace, string> = {
  start: "Įrašykite tikslų pakrovimo adresą – sandėliai dažniausiai būna už tokių zonų.",
  end: "Įrašykite tikslų iškrovimo adresą – sandėliai dažniausiai būna už tokių zonų.",
  route: "Patikrinkite maršrutą arba pasirinkite kitą variantą.",
};
