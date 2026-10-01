/**
 * Furų puslapio skirtukai (#169).
 *
 * Furos ir jų kaštai buvo du meniu punktai, nors tai tos pačios furos. Dabar
 * vienas puslapis, o skirtukas laikomas adrese (`?skiltis=kastai`), kad
 * nuorodą į kaštus būtų galima atidaryti tiesiai.
 */

export const TRUCK_TABS = [
  { key: "sarasas", label: "Sąrašas" },
  { key: "kastai", label: "Paros kaštai" },
  { key: "svoriai", label: "Svoriai" },
] as const;

export type TruckTab = (typeof TRUCK_TABS)[number]["key"];

/** Nežinomas ar tuščias skirtukas – sąrašas, o ne klaida. */
export function parseTruckTab(value: string | string[] | undefined): TruckTab {
  const text = Array.isArray(value) ? value[0] : value;
  return TRUCK_TABS.find((tab) => tab.key === text)?.key ?? "sarasas";
}

export function truckTabHref(tab: TruckTab): string {
  return tab === "sarasas" ? "/trucks" : `/trucks?skiltis=${tab}`;
}
