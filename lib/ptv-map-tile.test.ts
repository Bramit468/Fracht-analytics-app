import { describe, expect, it } from "vitest";

import { PTV_MAP_LAYERS, ptvMapTile, ptvMapTileUrl } from "./ptv-map-tile";

describe("ptvMapTile", () => {
  it.each(PTV_MAP_LAYERS)("priima leidžiamą %s sluoksnį", (layer) => {
    expect(ptvMapTile(layer, "10", "511", "512")).toEqual({
      layer,
      zoomLevel: 10,
      x: 511,
      y: 512,
    });
  });

  it.each([
    ["background", "10", "1", "1"],
    ["trafficIncidents", "23", "1", "1"],
    ["trafficIncidents", "10.5", "1", "1"],
    ["trafficIncidents", "10", "-1", "1"],
    ["trafficIncidents", "10", "1024", "1"],
    ["trafficIncidents", "10", "1", "1024"],
  ])("atmeta blogus parametrus", (layer, zoom, x, y) => {
    expect(ptvMapTile(layer, zoom, x, y)).toBeNull();
  });

  it("sukuria sunkvežimio sluoksnio URL be API rakto", () => {
    const tile = ptvMapTile("restrictions", "12", "2200", "1400");
    if (!tile) throw new Error("plytelė turėjo būti teisinga");

    const url = new URL(ptvMapTileUrl(tile));
    expect(url.pathname).toBe("/rastermaps/v1/image-tiles/12/2200/1400");
    expect(url.searchParams.get("layers")).toBe("restrictions");
    expect(url.searchParams.get("vehicleType")).toBe("TRUCK");
    expect(url.searchParams.get("showOnlyRelevantByTime")).toBe("true");
    expect(url.searchParams.has("apiKey")).toBe(false);
  });
});
