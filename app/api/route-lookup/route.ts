import { runRouteLookup } from "@/app/trips/new/route-core";
import { parseRouteInput } from "@/lib/route-input";

/**
 * Maršrutas tempiant (#74).
 *
 * Tai route handler, o ne server action, nes tik `fetch` leidžia nutraukti
 * pasenusią užklausą: kai naršyklė atsisako, `request.signal` nutrūksta ir
 * PTV užklausa nenueina veltui. Tempiant tarpinį tašką jų gali būti keletas
 * per sekundę; server action'ai eina eilėje ir nutraukti jų negalima.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "Netinkama užklausa." }, { status: 400 });
  }

  const input = parseRouteInput(body);
  if (!input) return Response.json({ ok: false, message: "Netinkama užklausa." }, { status: 400 });

  try {
    return Response.json(await runRouteLookup(input, request.signal));
  } catch (cause) {
    // Naršyklė pati atsisakė atsakymo; niekas jo neskaitys.
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error("Maršruto užklausa nepavyko", cause);
    return Response.json({ ok: false, message: "Nepavyko suskaičiuoti maršruto." }, { status: 500 });
  }
}
