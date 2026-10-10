import { describe, expect, it } from "vitest";

import {
  PTV_MAP_LAYERS,
  PTV_VECTOR_TILES,
  ptvMapTile,
  ptvMapTileUrl,
  ptvVectorProxyUrl,
  ptvVectorTile,
  ptvVectorTileUrl,
} from "./ptv-map-tile";

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

describe("ptvVectorTile", () => {
  it("priima pagrindo plytelę ir sudaro PTV adresą be rakto", () => {
    const tile = ptvVectorTile("12", "2330", "1290");
    if (!tile) throw new Error("plytelė turėjo būti teisinga");

    expect(ptvVectorTileUrl(tile)).toBe("https://api.myptv.com/maps/v1/vector-tiles/12/2330/1290");
  });

  it.each([
    ["18", "1", "1"],
    ["5", "32", "1"],
    ["5", "1", "x"],
  ])("atmeta blogas koordinates %s/%s/%s", (zoom, x, y) => {
    expect(ptvVectorTile(zoom, x, y)).toBeNull();
  });
});

describe("ptvVectorProxyUrl", () => {
  it("PTV pagrindo plytelę nukreipia per mūsų serverį", () => {
    expect(ptvVectorProxyUrl(`${PTV_VECTOR_TILES}5/18/10`, "https://bramit.lt")).toBe(
      "https://bramit.lt/api/ptv-vector/5/18/10",
    );
  });

  it("šriftų, ikonų ir kitų adresų neliečia", () => {
    expect(
      ptvVectorProxyUrl("https://vectormaps-resources.myptv.com/icons/latest/sprite.json", "https://bramit.lt"),
    ).toBeNull();
    expect(
      ptvVectorProxyUrl("https://api.myptv.com/maps/overlays/v1/vector-tiles/9/1/1?layers=toll", "https://bramit.lt"),
    ).toBeNull();
  });

  it("nepraleidžia papildomų parametrų", () => {
    // Kitaip per mūsų serverį su raktu būtų galima siųsti bet ką.
    expect(ptvVectorProxyUrl(`${PTV_VECTOR_TILES}5/18/10?foo=bar`, "https://bramit.lt")).toBeNull();
  });
});
