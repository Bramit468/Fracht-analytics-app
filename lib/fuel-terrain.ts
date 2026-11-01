/**
 * Kuro norma pagal maršruto profilį: kalnai, keliai, svoris (PTV HBEFA).
 *
 * PTV vienas pats Mitrenos furoms netinka: 2026-11-01 patikra (17 maršrutų,
 * 102 importuoti reisai Švedija–Norvegija) – PTV 43–47 l/100 visiems
 * maršrutams, faktas 22–38, vidutiniškai PTV +41 %. Be krovinio svorio PTV
 * laiko furą pilną (40 t), o maršrutų skirtumų beveik nerodo.
 *
 * Todėl pagrindas lieka tikras furos vidurkis, o PTV pasako tik santykį: kiek
 * šis maršrutas sunkesnis ar lengvesnis už įprastą. Kalnuose PTV rodo daugiau
 * nei įprastai – fura gauna daugiau, lygumose – mažiau.
 */

/** PTV l/100 Mitrenos įprastiems maršrutams (svertinis, 2026-11-01, be svorio). */
export const PTV_REFERENCE_L100 = 44.3;

/** Faktas ÷ PTV tiems patiems reisams – kai furos vidurkio nėra. */
export const PTV_FLEET_CALIBRATION = 0.71;

/** Ribos: vienas keistas PTV skaičius neturi padvigubinti kuro. */
const MIN_FACTOR = 0.8;
const MAX_FACTOR = 1.3;

export function terrainFactor(ptvLitresPer100Km: number | null): number | null {
  if (ptvLitresPer100Km === null || !(ptvLitresPer100Km > 0)) return null;
  const factor = ptvLitresPer100Km / PTV_REFERENCE_L100;
  return Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, Math.round(factor * 1000) / 1000));
}

export interface TerrainFuel {
  litresPer100Km: number;
  /** Žmogui – iš ko skaičius. */
  note: string;
}

/**
 * Furos norma, pakoreguota maršrutui. Be furos vidurkio – PTV su parko
 * kalibracija. `null`, kai PTV įverčio nėra: lieka furos vidurkis kaip buvo.
 */
export function terrainAdjustedFuel(truckLitresPer100Km: number | null, ptvLitresPer100Km: number | null): TerrainFuel | null {
  const factor = terrainFactor(ptvLitresPer100Km);
  if (factor === null || ptvLitresPer100Km === null) return null;
  const lt = (value: number, digits = 1) => value.toFixed(digits).replace(".", ",");
  if (truckLitresPer100Km !== null && truckLitresPer100Km > 0) {
    const value = Math.round(truckLitresPer100Km * factor * 100) / 100;
    return {
      litresPer100Km: value,
      note: `Kuras: ${lt(value)} l/100 – furos 30 d. faktas ${lt(truckLitresPer100Km)} × maršruto profilis ${lt(factor, 2)} (PTV: nuolydžiai, keliai, svoris; ${lt(ptvLitresPer100Km)} prieš įprastus ${lt(PTV_REFERENCE_L100)}).`,
    };
  }
  const value = Math.round(ptvLitresPer100Km * PTV_FLEET_CALIBRATION * 100) / 100;
  return {
    litresPer100Km: value,
    note: `Kuras: ${lt(value)} l/100 – furos fakto nėra, todėl PTV maršruto įvertis ${lt(ptvLitresPer100Km)} × parko kalibracija ${lt(PTV_FLEET_CALIBRATION, 2)}.`,
  };
}
