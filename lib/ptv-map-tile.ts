export const PTV_MAP_LAYERS = [
  "trafficIncidents",
  "restrictions",
  "toll",
  "lowEmissionZones",
] as const;

export type PtvMapLayer = (typeof PTV_MAP_LAYERS)[number];

export interface PtvMapTile {
  layer: PtvMapLayer;
  zoomLevel: number;
  x: number;
  y: number;
}

function integer(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Keeps the public tile proxy limited to real Web Mercator PTV tiles. */
export function ptvMapTile(
  layer: string,
  zoomLevel: string,
  x: string,
  y: string,
): PtvMapTile | null {
  if (!PTV_MAP_LAYERS.includes(layer as PtvMapLayer)) return null;

  const parsedZoom = integer(zoomLevel);
  const parsedX = integer(x);
  const parsedY = integer(y);
  if (parsedZoom === null || parsedZoom > 22 || parsedX === null || parsedY === null) return null;

  const tilesPerAxis = 2 ** parsedZoom;
  if (parsedX >= tilesPerAxis || parsedY >= tilesPerAxis) return null;

  return {
    layer: layer as PtvMapLayer,
    zoomLevel: parsedZoom,
    x: parsedX,
    y: parsedY,
  };
}

export function ptvMapTileUrl(tile: PtvMapTile): string {
  const url = new URL(
    `https://api.myptv.com/rastermaps/v1/image-tiles/${tile.zoomLevel}/${tile.x}/${tile.y}`,
  );
  url.searchParams.set("layers", tile.layer);
  url.searchParams.set("vehicleType", "TRUCK");
  url.searchParams.set("showOnlyRelevantByTime", "true");
  return url.toString();
}
