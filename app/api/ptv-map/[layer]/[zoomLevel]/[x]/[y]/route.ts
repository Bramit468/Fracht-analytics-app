import { ptvMapTile, ptvMapTileUrl } from "../../../../../../../lib/ptv-map-tile";

const TILE_CACHE_SECONDS = 60;

interface TileContext {
  params: Promise<{
    layer: string;
    zoomLevel: string;
    x: string;
    y: string;
  }>;
}

export async function GET(_request: Request, context: TileContext) {
  const { layer, zoomLevel, x, y } = await context.params;
  const tile = ptvMapTile(layer, zoomLevel, x, y);
  if (!tile) {
    return Response.json({ error: "Neteisingi žemėlapio plytelės parametrai." }, { status: 400 });
  }

  const apiKey = process.env.PTV_API_KEY?.trim();
  if (!apiKey) {
    return Response.json({ error: "PTV žemėlapio paslauga nesukonfigūruota." }, { status: 503 });
  }

  try {
    const upstream = await fetch(ptvMapTileUrl(tile), {
      headers: { ApiKey: apiKey, Accept: "image/png" },
      next: { revalidate: TILE_CACHE_SECONDS },
    });
    if (!upstream.ok) {
      console.error("PTV žemėlapio plytelės klaida", upstream.status, tile);
      return Response.json({ error: "Nepavyko gauti PTV žemėlapio sluoksnio." }, { status: 502 });
    }

    return new Response(await upstream.arrayBuffer(), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": `public, s-maxage=${TILE_CACHE_SECONDS}, stale-while-revalidate=300`,
      },
    });
  } catch (cause) {
    console.error("PTV žemėlapio plytelės ryšio klaida", cause, tile);
    return Response.json({ error: "Nepavyko gauti PTV žemėlapio sluoksnio." }, { status: 502 });
  }
}
