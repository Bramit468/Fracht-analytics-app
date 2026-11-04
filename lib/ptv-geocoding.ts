/** PTV geokodavimo URL su privalomu šalies filtru, kai šalis žinoma. */
export function ptvGeocodingUrl(
  endpoint: string,
  searchText: string,
  countryFilter?: string | null,
): string {
  const url = new URL(endpoint);
  url.searchParams.set("searchText", searchText);
  url.searchParams.set("language", "lt");

  const country = countryFilter?.trim().toUpperCase() ?? "";
  if (/^[A-Z]{2}$/.test(country)) url.searchParams.set("countryFilter", country);
  return url.toString();
}
