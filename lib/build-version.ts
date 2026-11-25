// Importo rezultate rodoma, su kuriuo diegimu jis paleistas: vartotojas dažnai
// spaudžia „Atnaujinti“ dar nepasibaigus Vercel diegimui ir gauna seno kodo rezultatą.
export function buildVersionLabel(commitMessage: string | undefined, sha: string | undefined): string | null {
  if (!sha) return null;
  const pr = commitMessage?.split("\n")[0].match(/\(#(\d+)\)\s*$/)?.[1];
  return pr ? `#${pr} (${sha.slice(0, 7)})` : sha.slice(0, 7);
}
