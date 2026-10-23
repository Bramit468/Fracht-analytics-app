/**
 * Maksimalūs dienpinigių dydžiai užsienyje (#187).
 *
 * Šaltinis: LRV 2004-04-29 nutarimas Nr. 526 „Dėl dienpinigių ir kitų
 * komandiruočių išlaidų apmokėjimo“, Maksimalių dienpinigių dydžių sąrašas,
 * suvestinė redakcija nuo 2026-10-01 iki 2027-06-30 (e-TAR,
 * TAR.E356C85AC1C6). Skaičiai perrašyti iš oficialaus teksto 2026-10-10.
 *
 * Raktas – ISO 3166 dviejų raidžių kodas, nes PTV maršruto įvykiuose šalis
 * nurodoma būtent taip. Įtrauktos tik šalys, į kurias realiai važiuoja
 * vilkikai iš Lietuvos (Europa, NVS, Kaukazas, Vidurinė Azija, Artimieji Rytai,
 * Šiaurės Afrika). Šalies, kurios čia nėra, norma laikoma **nežinoma**, o ne
 * „Kitos valstybės“ 33 €: sąraše ji gali būti, tik neperkelta, ir spėjimas
 * duotų tikslų atrodantį, bet neteisingą skaičių.
 *
 * Pasikeitus nutarimui, keisti čia ir `PER_DIEM_NORMS_VALID_FROM`. Jau
 * išsaugoti reisai nepasikeis: jų dienpinigiai užfiksuojami įrašant.
 */

export const PER_DIEM_NORMS_SOURCE =
  "LRV nutarimas Nr. 526, Maksimalių dienpinigių dydžių sąrašas (redakcija nuo 2026-10-01)";
export const PER_DIEM_NORMS_VALID_FROM = "2026-10-01";

/** EUR per dieną. */
export const PER_DIEM_NORMS_EUR: Readonly<Record<string, number>> = {
  // Europa
  AD: 46, // Andora
  AL: 33, // Albanija
  AT: 69, // Austrija
  BA: 43, // Bosnija ir Hercegovina
  BE: 61, // Belgija
  BG: 39, // Bulgarija
  BY: 60, // Baltarusija
  CH: 80, // Šveicarija
  CY: 62, // Kipras
  CZ: 50, // Čekija
  DE: 62, // Vokietija
  DK: 80, // Danija
  EE: 47, // Estija
  ES: 58, // Ispanija
  FI: 69, // Suomija
  FR: 69, // Prancūzija
  GB: 67, // Jungtinė Karalystė
  GR: 55, // Graikija
  HR: 45, // Kroatija
  HU: 48, // Vengrija
  IE: 69, // Airija
  IS: 70, // Islandija
  IT: 63, // Italija
  LI: 80, // Lichtenšteinas
  LT: 28, // Lietuva
  LU: 61, // Liuksemburgas
  LV: 44, // Latvija
  MC: 49, // Monakas
  MD: 53, // Moldova
  ME: 53, // Juodkalnija
  MK: 40, // Šiaurės Makedonija
  MT: 63, // Malta
  NL: 64, // Nyderlandai
  NO: 70, // Norvegija
  PL: 48, // Lenkija
  PT: 56, // Portugalija
  RO: 35, // Rumunija
  RS: 53, // Serbija
  RU: 60, // Rusija
  SE: 70, // Švedija
  SI: 52, // Slovėnija
  SK: 53, // Slovakija
  SM: 63, // San Marinas
  TR: 37, // Turkija
  UA: 53, // Ukraina
  VA: 63, // Vatikanas
  XK: 40, // Kosovas
  // Kaukazas, Vidurinė Azija
  AM: 47, // Armėnija
  AZ: 47, // Azerbaidžanas
  GE: 53, // Sakartvelas
  KG: 60, // Kirgizija
  KZ: 60, // Kazachstanas
  MN: 50, // Mongolija
  TJ: 60, // Tadžikistanas
  TM: 53, // Turkmėnistanas
  UZ: 60, // Uzbekistanas
  CN: 37, // Kinija
  AF: 33, // Afganistanas
  PK: 33, // Pakistanas
  // Artimieji Rytai
  AE: 60, // Jungtiniai Arabų Emyratai
  BH: 60, // Bahreinas
  IL: 70, // Izraelis
  IQ: 40, // Irakas
  IR: 37, // Iranas
  JO: 40, // Jordanija
  KW: 60, // Kuveitas
  LB: 47, // Libanas
  OM: 47, // Omanas
  QA: 52, // Kataras
  SA: 60, // Saudo Arabija
  SY: 53, // Sirija
  YE: 40, // Jemenas
  // Šiaurės Afrika
  DZ: 57, // Alžyras
  EG: 50, // Egiptas
  LY: 33, // Libija
  MA: 50, // Marokas
  TN: 40, // Tunisas
};

/** Norma centais. `null` – šalies normos sąraše nėra. */
export function perDiemNormCents(countryCode: string): number | null {
  const eur = PER_DIEM_NORMS_EUR[countryCode.toUpperCase()];
  return eur === undefined ? null : eur * 100;
}

/**
 * Telematika šalį rašo trimis raidėmis („SWE“), normos – dviem („SE“).
 * Tik sąrašo šalims: kitų normos vis tiek nežinomos.
 */
const ISO3_TO_ISO2: Readonly<Record<string, string>> = {
  AND: "AD", ALB: "AL", AUT: "AT", BIH: "BA", BEL: "BE", BGR: "BG", BLR: "BY", CHE: "CH", CYP: "CY", CZE: "CZ",
  DEU: "DE", DNK: "DK", EST: "EE", ESP: "ES", FIN: "FI", FRA: "FR", GBR: "GB", GRC: "GR", HRV: "HR", HUN: "HU",
  IRL: "IE", ISL: "IS", ITA: "IT", LIE: "LI", LTU: "LT", LUX: "LU", LVA: "LV", MCO: "MC", MDA: "MD", MNE: "ME",
  MKD: "MK", MLT: "MT", NLD: "NL", NOR: "NO", POL: "PL", PRT: "PT", ROU: "RO", SRB: "RS", RUS: "RU", SWE: "SE",
  SVN: "SI", SVK: "SK", SMR: "SM", TUR: "TR", UKR: "UA", VAT: "VA", XKX: "XK",
  ARM: "AM", AZE: "AZ", GEO: "GE", KGZ: "KG", KAZ: "KZ", MNG: "MN", TJK: "TJ", TKM: "TM", UZB: "UZ", CHN: "CN",
  AFG: "AF", PAK: "PK", ARE: "AE", BHR: "BH", ISR: "IL", IRQ: "IQ", IRN: "IR", JOR: "JO", KWT: "KW", LBN: "LB",
  OMN: "OM", QAT: "QA", SAU: "SA", SYR: "SY", YEM: "YE", DZA: "DZ", EGY: "EG", LBY: "LY", MAR: "MA", TUN: "TN",
};

/** „SWE“ → „SE“. `null` – šalies sąraše nėra. */
export function iso2FromIso3(code: string): string | null {
  return ISO3_TO_ISO2[code.toUpperCase()] ?? null;
}
