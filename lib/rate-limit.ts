/**
 * Užklausų ribojimas vienam vartotojui: slenkantis langas (sliding window log).
 *
 * Saugo ne žmones nuo įsilaužėlių – /api ir taip tik prisijungusiems, – o
 * sąskaitas: klaida ar ciklas naršyklėje neturi išleisti OpenAI kredito ar PTV
 * kvotos. Raktas – vartotojo ID, ne IP: visas biuras dalijasi vienu IP.
 *
 * ponytail: skaitiklis serverio atmintyje, todėl kiekvienas Vercel egzempliorius
 * skaičiuoja atskirai ir riba apytikslė. Jei vartotojų taps daug arba ribos
 * turės būti tikslios – bendras skaitiklis (Upstash Redis).
 */

export interface Window {
  max: number;
  ms: number;
}

export interface RateDecision {
  ok: boolean;
  /** Griežčiausio lango duomenys – jie ir rodomi antraštėse. */
  limit: number;
  remaining: number;
  /** Kada atsilaisvins vieta, ms nuo epochos. */
  resetAt: number;
  /** Kiek sekundžių laukti, kai `ok` – false. */
  retryAfterS: number;
}

export function createRateLimiter(windows: Window[]) {
  const longest = Math.max(...windows.map((window) => window.ms));
  const hits = new Map<string, number[]>();

  return function check(key: string, now = Date.now()): RateDecision {
    const recent = (hits.get(key) ?? []).filter((at) => at > now - longest);
    const decisions = windows.map((window): RateDecision => {
      const inWindow = recent.filter((at) => at > now - window.ms);
      const ok = inWindow.length < window.max;
      const resetAt = (inWindow[0] ?? now) + window.ms;
      return {
        ok,
        limit: window.max,
        remaining: ok ? window.max - inWindow.length - 1 : 0,
        resetAt,
        retryAfterS: Math.max(1, Math.ceil((resetAt - now) / 1000)),
      };
    });

    // Atmesta – rodomas ilgiausias laukimas; praleista – mažiausiai likęs langas.
    const denied = decisions.filter((decision) => !decision.ok).sort((a, b) => b.resetAt - a.resetAt)[0];
    const decision = denied ?? decisions.reduce((tightest, next) => (next.remaining < tightest.remaining ? next : tightest));
    if (decision.ok) recent.push(now);
    if (recent.length) hits.set(key, recent);
    else hits.delete(key);
    return decision;
  };
}

/** Antraštės kaip įprasta (X-RateLimit-*); Reset – Unix sekundės. */
export function rateLimitHeaders(decision: RateDecision): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(decision.limit),
    "X-RateLimit-Remaining": String(decision.remaining),
    "X-RateLimit-Reset": String(Math.ceil(decision.resetAt / 1000)),
    ...(decision.ok ? {} : { "Retry-After": String(decision.retryAfterS) }),
  };
}

export function rateLimitMessage(decision: RateDecision): string {
  return `Per daug užklausų. Bandykite po ${decision.retryAfterS} s.`;
}

/** Atsakymą papildo ribos antraštėmis, nekeisdamas jo turinio. */
export function withRateLimitHeaders(response: Response, decision: RateDecision): Response {
  for (const [name, value] of Object.entries(rateLimitHeaders(decision))) response.headers.set(name, value);
  return response;
}

const MINUTE = 60_000;

/** Ribos, dėl kurių sutarta 2026-10-27. */
export const assistantLimiter = createRateLimiter([{ max: 10, ms: MINUTE }, { max: 100, ms: 24 * 60 * MINUTE }]);
export const routeLookupLimiter = createRateLimiter([{ max: 60, ms: MINUTE }]);
export const addressSearchLimiter = createRateLimiter([{ max: 60, ms: MINUTE }]);
/** Įklijuoti pasiūlymai, kurių taisyklės nesuprato – kiekvienas mokamas OpenAI kvietimas. */
export const offerParseLimiter = createRateLimiter([{ max: 20, ms: MINUTE }, { max: 300, ms: 24 * 60 * MINUTE }]);
