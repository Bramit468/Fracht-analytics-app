import { describe, expect, it } from "vitest";

import { ptvGeocodingUrl } from "./ptv-geocoding";

describe("ptvGeocodingUrl", () => {
  it("apriboja pasiūlymo adresą nurodyta šalimi", () => {
    const url = new URL(ptvGeocodingUrl(
      "https://api.myptv.com/geocoding/v1/locations/by-text",
      "50197 Zaragoza, ES",
      "es",
    ));

    expect(url.searchParams.get("searchText")).toBe("50197 Zaragoza, ES");
    expect(url.searchParams.get("countryFilter")).toBe("ES");
    expect(url.searchParams.get("language")).toBe("lt");
  });

  it("neperduoda netinkamo šalies filtro", () => {
    const url = new URL(ptvGeocodingUrl("https://example.test/by-text", "Bremen", "Jungtinės Valstijos"));
    expect(url.searchParams.has("countryFilter")).toBe(false);
  });
});
