import { ptvVectorTile, ptvVectorTileUrl } from "../../../../../../lib/ptv-map-tile";

/**
 * Kelių žemėlapis keičiasi retai, todėl plytelė laikoma CDN visą parą: tas pats
 * vaizdas kitam vartotojui nebekainuoja PTV užklausos (#177).
 */
const TILE_CACHE_SECONDS = 86_400;

interface TileContext {
  params: Promise<{
    zoomLevel: string;
    x: string;
    y: string;
  }>;
}

/** PTV vektorinio pagrindo plytelė per mūsų serverį, kad raktas liktų serveryje. */
export async function GET(_request: Request, context: TileContext) {
  const { zoomLevel, x, y } = await context.params;
  const tile = ptvVectorTile(zoomLevel, x, y);
  if (!tile) {
    return Response.json({ error: "Neteisingi žemėlapio plytelės parametrai." }, { status: 400 });
  }

  const apiKey = process.env.PTV_API_KEY?.trim();
  if (!apiKey) {
    return Response.json({ error: "PTV žemėlapio paslauga nesukonfigūruota." }, { status: 503 });
  }

  try {
    const upstream = await fetch(ptvVectorTileUrl(tile), {
      headers: { ApiKey: apiKey, Accept: "application/vnd.mapbox-vector-tile" },
      next: { revalidate: TILE_CACHE_SECONDS },
    });
    if (!upstream.ok) {
      console.error("PTV vektorinės plytelės klaida", upstream.status, tile);
      return Response.json({ error: "Nepavyko gauti PTV žemėlapio." }, { status: 502 });
    }

    return new Response(await upstream.arrayBuffer(), {
      headers: {
        "Content-Type": "application/vnd.mapbox-vector-tile",
        "Cache-Control": `public, s-maxage=${TILE_CACHE_SECONDS}, stale-while-revalidate=604800`,
      },
    });
  } catch (cause) {
    console.error("PTV vektorinės plytelės ryšio klaida", cause, tile);
    return Response.json({ error: "Nepavyko gauti PTV žemėlapio." }, { status: 502 });
  }
}
