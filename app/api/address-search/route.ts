import { MIN_ADDRESS_QUERY, PTV_SUGGESTIONS_URL, parseSuggestions } from "@/lib/address-suggest";
import { normalizeAddressQuery, parsePostalQuery } from "@/lib/postal-code";
import { createServerSupabaseClient } from "@/lib/supabase-server";

/**
 * Adresų pasiūlymai rašant (#73).
 *
 * Tai route handler, o ne server action, nes tik `fetch` leidžia nutraukti
 * pasenusią užklausą: `request.signal` nutrūksta, kai naršyklė
 * atšaukia, ir PTV užklausa nenueina veltui. Raktas lieka serveryje.
 *
 * Tuščias sąrašas – ne klaida: pasiūlymai yra pagalba, forma veikia ir be jų.
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < MIN_ADDRESS_QUERY) return Response.json([]);
  // „FR51“ PTV supainioja su Airijos kodu: neišsamo pašto kodo neieškome.
  if (parsePostalQuery(query)?.partial) return Response.json([]);

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return Response.json({ error: "Prisijunkite iš naujo." }, { status: 401 });

  const key = process.env.PTV_API_KEY?.trim();
  if (!key) return Response.json({ error: "PTV paslauga nesukonfigūruota." }, { status: 503 });

  try {
    const url = `${PTV_SUGGESTIONS_URL}?searchText=${encodeURIComponent(normalizeAddressQuery(query))}&language=lt`;
    const upstream = await fetch(url, {
      headers: { apiKey: key },
      cache: "no-store",
      signal: request.signal,
    });
    if (!upstream.ok) {
      console.error("PTV adresų pasiūlymų klaida", upstream.status);
      return Response.json({ error: "Nepavyko gauti adresų." }, { status: 502 });
    }
    return Response.json(parseSuggestions(await upstream.json()));
  } catch (cause) {
    // Atšaukimas yra įprastas reikalas rašant, o ne gedimas.
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error("PTV adresų pasiūlymų ryšio klaida", cause);
    return Response.json({ error: "Nepavyko gauti adresų." }, { status: 502 });
  }
}
