/**
 * PTV kuro sąnaudos ir CO2e (#86).
 *
 * Reiso skaičiavimas naudoja vieną normą, pvz. 27 l/100 km, ir taiko ją
 * vienodai lygumoms Lenkijoje ir kalnams Norvegijoje. PTV skaičiuoja pagal patį
 * maršrutą ir vilkiko masę.
 *
 * Patikrinta su tikru raktu, Panevėžys–Oslas, 2054 km:
 *   be svorių            662,9 l
 *   20 t krovinio        613,5 l
 *   5 t krovinio         468,0 l
 * Masė yra tikras veiksnys, todėl jos ir klausiame.
 *
 * Metodas `EN16258_2012_HBEFA` pasirinktas sąmoningai: jis vienintelis iš
 * palaikomų atsižvelgia į kelio profilį ir svorį. Paprastasis `EN16258_2012`
 * tam pačiam maršrutui grąžina 598 l nepriklausomai nuo krovinio.
 */

/** PTV `results` reikšmė. Į kelio profilį ir masę atsižvelgiantis metodas. */
export const PTV_EMISSIONS_RESULT = "EMISSIONS_EN16258_2012_HBEFA";

/**
 * PTV `fuelConsumption` yra **kilogramai**, ne litrai. Dokumentacijoje vienetai
 * nenurodyti, todėl patikrinta iš pačių skaičių:
 *
 *   co2eTankToWheel / fuelConsumption = 2102,4 / 662,9 = 3,17
 *   energyUseTankToWheel / fuelConsumption = 28372 / 662,9 = 42,8
 *
 * 3,17 kg CO2 iš kilogramo dyzelino ir 42,8 MJ kilograme yra dyzelino fizika;
 * litrui tie santykiai būtų 2,64 ir 35,8. Paėmus kilogramus už litrus, kuras
 * atrodytų penktadaliu mažesnis, ir klaida būtų nematoma — skaičius atrodytų
 * visai tikėtinas.
 */
export const DIESEL_KG_PER_LITRE = 0.832;

export interface VehicleWeights {
  /** Vilkiko su priekaba svoris be krovinio, kg. */
  emptyWeightKg?: number | null;
  /** Krovinio svoris, kg. Jo PTV negali žinoti – jis kiekvieno reiso savas. */
  loadWeightKg?: number | null;
  totalPermittedWeightKg?: number | null;
}

export interface RouteEmissions {
  /** Kaip grąžina PTV — kilogramais. */
  fuelKg: number;
  /** Tas pats kuras litrais, kad būtų galima lyginti su norma ir kaina. */
  fuelLitres: number;
  /** Faktinės sąnaudos maršrute. `null`, kai maršruto ilgis nežinomas. */
  litresPer100Km: number | null;
  /** Išmetama važiuojant, tonomis. */
  co2eTankToWheelTonnes: number;
  /** Įskaitant kuro gamybą ir gabenimą, tonomis. Šito klausia užsakovai. */
  co2eWellToWheelTonnes: number;
}

/**
 * Svoriai į PTV užklausos parametrus.
 *
 * Nenurodyti svoriai praleidžiami, o ne užpildomi spėjimu: PTV tada ima savo
 * numatytąsias reikšmes ir tai matyti iš `weightsUsed`.
 */
export function weightParams(weights: VehicleWeights): Record<string, string> {
  const params: Record<string, string> = {};
  const add = (name: string, value: number | null | undefined) => {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      params[`vehicle[${name}]`] = String(Math.round(value));
    }
  };

  add("emptyWeight", weights.emptyWeightKg);
  add("loadWeight", weights.loadWeightKg);
  add("totalPermittedWeight", weights.totalPermittedWeightKg);

  return params;
}

/** Ar bent vienas svoris perduotas – nuo to priklauso, kiek skaičiumi tikėti. */
export function hasWeights(weights: VehicleWeights): boolean {
  return Object.keys(weightParams(weights)).length > 0;
}

function decimal(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * PTV atsakymo `emissions` dalis į mūsų tipą.
 *
 * Metodo raktas (`en16258_2012`) neįrašomas į kodą kietai: PTV jį rašo pagal
 * metodą, o paprašius kito metodo pavadinimas pasikeistų tyliai.
 */
export function routeEmissions(payload: unknown, km: number): RouteEmissions | null {
  if (typeof payload !== "object" || payload === null) return null;

  const emissions = (payload as { emissions?: unknown }).emissions;
  if (typeof emissions !== "object" || emissions === null) return null;

  const first = Object.values(emissions as Record<string, unknown>)[0];
  if (typeof first !== "object" || first === null) return null;

  const row = first as Record<string, unknown>;
  const fuelKg = decimal(row.fuelConsumption);
  if (fuelKg === null) return null;

  const fuelLitres = fuelKg / DIESEL_KG_PER_LITRE;

  // CO2e ateina kilogramais; sutartyse ir konkursuose kalbama tonomis.
  const toTonnes = (kilograms: number | null) =>
    kilograms === null ? 0 : Math.round(kilograms) / 1000;

  return {
    fuelKg: Math.round(fuelKg * 10) / 10,
    fuelLitres: Math.round(fuelLitres * 10) / 10,
    litresPer100Km: km > 0 ? Math.round((fuelLitres / km) * 100 * 100) / 100 : null,
    co2eTankToWheelTonnes: toTonnes(decimal(row.co2eTankToWheel)),
    co2eWellToWheelTonnes: toTonnes(decimal(row.co2eWellToWheel)),
  };
}

/**
 * Skirtumas nuo įvestos normos, procentais.
 *
 * `null`, kai norma nulinė: dalyba iš nulio duotų begalybę, o ne didelį
 * skirtumą.
 */
export function consumptionGapPercent(
  ptvLitresPer100Km: number | null,
  ownLitresPer100Km: number,
): number | null {
  if (ptvLitresPer100Km === null || ownLitresPer100Km <= 0) return null;
  return ((ptvLitresPer100Km - ownLitresPer100Km) / ownLitresPer100Km) * 100;
}
