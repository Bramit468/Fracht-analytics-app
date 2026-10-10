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

export interface TileCoordinates {
  zoomLevel: number;
  x: number;
  y: number;
}

/** Tik tikros Web Mercator plytelės: proxy neturi tapti laisvu PTV rakto naudojimu. */
function tileCoordinates(
  zoomLevel: string,
  x: string,
  y: string,
  maxZoom: number,
): TileCoordinates | null {
  const parsedZoom = integer(zoomLevel);
  const parsedX = integer(x);
  const parsedY = integer(y);
  if (parsedZoom === null || parsedZoom > maxZoom || parsedX === null || parsedY === null) return null;

  const tilesPerAxis = 2 ** parsedZoom;
  if (parsedX >= tilesPerAxis || parsedY >= tilesPerAxis) return null;

  return { zoomLevel: parsedZoom, x: parsedX, y: parsedY };
}

/** Keeps the public tile proxy limited to real Web Mercator PTV tiles. */
export function ptvMapTile(
  layer: string,
  zoomLevel: string,
  x: string,
  y: string,
): PtvMapTile | null {
  if (!PTV_MAP_LAYERS.includes(layer as PtvMapLayer)) return null;

  const coordinates = tileCoordinates(zoomLevel, x, y, 22);
  return coordinates && { layer: layer as PtvMapLayer, ...coordinates };
}

/**
 * PTV vektorinio pagrindo plytelės (#177). PTV jas teikia iki 17 mastelio;
 * toliau MapLibre pats didina 17-ąsias, todėl didesnių prašyti nereikia.
 */
export const PTV_VECTOR_MAX_ZOOM = 17;

export function ptvVectorTile(zoomLevel: string, x: string, y: string): TileCoordinates | null {
  return tileCoordinates(zoomLevel, x, y, PTV_VECTOR_MAX_ZOOM);
}

export function ptvVectorTileUrl(tile: TileCoordinates): string {
  return `${PTV_VECTOR_TILES}${tile.zoomLevel}/${tile.x}/${tile.y}`;
}

/** Taip PTV stiliuje (`standard.json`) užrašytas pagrindo plytelių adresas. */
export const PTV_VECTOR_TILES = "https://api.myptv.com/maps/v1/vector-tiles/";

/** Viešas PTV stilius: spalvos, šriftai ir ikonos rakto nereikalauja, tik plytelės. */
export const PTV_VECTOR_STYLE = "https://vectormaps-resources.myptv.com/styles/latest/standard.json";

/**
 * Stilius prašo plytelių tiesiai iš PTV, bet raktas naršyklei neduodamas –
 * todėl užklausa nukreipiama per mūsų serverį. Kiti adresai (šriftai, ikonos,
 * palydovas) paliekami kaip yra.
 */
export function ptvVectorProxyUrl(url: string, origin: string): string | null {
  if (!url.startsWith(PTV_VECTOR_TILES)) return null;
  const match = /^(\d+)\/(\d+)\/(\d+)$/.exec(url.slice(PTV_VECTOR_TILES.length));
  if (!match) return null;
  return `${origin}/api/ptv-vector/${match[1]}/${match[2]}/${match[3]}`;
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
