/**
 * Meniu punktai (#135).
 *
 * Iki šiol meniu buvo tik suvestinėje ir išvardijo ne visus puslapius: furų
 * sąrašo (`/trucks`) ir jų kaštų nebuvo niekur, nors būtent ten suvedama paros
 * savikaina, nuo kurios priklauso kiekvienas pelno skaičius. Patekti buvo
 * galima tik įrašius adresą ranka.
 */

export interface NavItem {
  href: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Suvestinė" },
  { href: "/trips", label: "Reisai" },
  { href: "/trips/new", label: "Naujas reisas" },
  { href: "/trips/vyksta", label: "Vyksta dabar" },
  { href: "/trips/import", label: "Importas iš Excel" },
  // Kaštai ir svoriai – skirtukai furų puslapyje, ne atskiri punktai (#169).
  { href: "/trucks", label: "Furos" },
  { href: "/telematika", label: "Analizė" },
  { href: "/imone", label: "Įmonė" },
];

/**
 * Kuris punktas pažymimas esamu.
 *
 * Imamas ilgiausias tinkantis adresas: `/trips/new` turi pažymėti „Naują
 * reisą“, o ne „Reisus“, nors abu prasideda vienodai. Pagrindinis puslapis
 * lyginamas tiksliai — kitaip jis būtų pažymėtas visur.
 */
export function activeNavHref(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  const matches = NAV_ITEMS.filter(({ href }) =>
    href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`),
  );

  return matches.reduce<string | null>(
    (best, item) => (best === null || item.href.length > best.length ? item.href : best),
    null,
  );
}
