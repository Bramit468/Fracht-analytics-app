/**
 * Bramit ženklas (#205): maršruto linija nuo pakrovimo iki iškrovimo taško.
 * Piešiamas SVG, todėl ryškus bet kokiu dydžiu ir nereikia paveikslėlio failo.
 */
export function BrandMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true" className={className}>
      <rect width="28" height="28" rx="6" fill="var(--brand)" />
      <path
        d="M8 20.5V14a4 4 0 0 1 4-4h4a4 4 0 0 0 4-4"
        fill="none"
        stroke="var(--sidebar)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="8" cy="20.5" r="2.2" fill="var(--sidebar)" />
      <circle cx="20" cy="6.5" r="2.2" fill="none" stroke="var(--sidebar)" strokeWidth="2" />
    </svg>
  );
}
