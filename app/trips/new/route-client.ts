import type { RouteLookupInput, RouteLookupResult } from "./route-core";

/** Kiek laiko prisiminti suskaičiuotą maršrutą: gyvas eismas keičiasi, tad ne ilgai. */
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_LIMIT = 20;

/**
 * Maršruto užklausos iš naršyklės.
 *
 * - Nauja užklausa nutraukia ankstesnę (`AbortController`): tempiant taškus
 *   kelis kartus iš eilės, PTV skaičiuoja tik paskutinį.
 * - Tas pats taškų sąrašas antrą kartą (pvz. grįžus į ankstesnį variantą ar
 *   pašalinus tašką) atsakomas iš atminties, be kreipimosi į PTV.
 */
export class RouteClient {
  private cache = new Map<string, { at: number; result: RouteLookupResult }>();
  private controller: AbortController | undefined;

  /** `null`, jei užklausą nutraukė naujesnė – jos rezultatas nebereikalingas. */
  async lookup(input: RouteLookupInput): Promise<{ result: RouteLookupResult; cached: boolean } | null> {
    const key = JSON.stringify(input);
    const hit = this.cache.get(key);
    this.controller?.abort();
    this.controller = undefined;

    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return { result: hit.result, cached: true };
    }

    const controller = new AbortController();
    this.controller = controller;
    try {
      const response = await fetch("/api/route-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      const result = (await response.json()) as RouteLookupResult;
      // Klaidos neprisimenamos: kitas bandymas gali pavykti.
      if (result.ok) this.remember(key, result);
      return { result, cached: false };
    } catch (cause) {
      if (controller.signal.aborted) return null;
      throw cause;
    } finally {
      if (this.controller === controller) this.controller = undefined;
    }
  }

  cancel() {
    this.controller?.abort();
    this.controller = undefined;
  }

  private remember(key: string, result: RouteLookupResult) {
    this.cache.set(key, { at: Date.now(), result });
    // Seniausias įrašas iškeliamas pirmas: Map išlaiko įdėjimo tvarką.
    if (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value as string);
  }
}
