/**
 * Meniu punktai (#135).
 *
 * Iki šiol meniu buvo tik suvestinėje ir išvardijo ne visus puslapius: furų
 * sąrašo (`/trucks`) ir jų kaštų nebuvo niekur, nors būtent ten suvedama paros
 * savikaina, nuo kurios priklauso kiekvienas pelno skaičius. Patekti buvo
 * galima tik įrašius adresą ranka.
 */

/** Meniu grupės: kasdienis darbas, duomenys ir nustatymai (#205). */
export type NavGroup = "darbas" | "duomenys" | "nustatymai";

export interface NavItem {
  href: string;
  label: string;
  group: NavGroup;
}

export const NAV_GROUP_LABELS: Record<NavGroup, string | null> = {
  darbas: null,
  duomenys: "Duomenys",
  nustatymai: null,
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Suvestinė", group: "darbas" },
  { href: "/trips", label: "Reisai", group: "darbas" },
  { href: "/trips/new", label: "Naujas reisas", group: "darbas" },
  { href: "/pasiulymai", label: "Pasiūlymai", group: "darbas" },
  { href: "/trips/vyksta", label: "Vyksta dabar", group: "darbas" },
  { href: "/dedikuoti", label: "Dedikuoti", group: "darbas" },
  // Kaštai ir svoriai – skirtukai furų puslapyje, ne atskiri punktai (#169).
  { href: "/trucks", label: "Furos", group: "duomenys" },
  { href: "/uzsakovai", label: "Užsakovai", group: "duomenys" },
  { href: "/telematika", label: "Analizė", group: "duomenys" },
  { href: "/trips/import", label: "Importas", group: "duomenys" },
  { href: "/imone", label: "Įmonė", group: "nustatymai" },
];

/**
 * Kuris punktas pažymimas esamu.
 *
 * Imamas ilgiausias tinkantis adresas: `/trips/new` turi pažymėti „Naują
 * reisą“, o ne „Reisus“, nors abu prasideda vienodai. Pagrindinis puslapis
 * lyginamas tiksliai – kitaip jis būtų pažymėtas visur.
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
