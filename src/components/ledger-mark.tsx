export function LedgerMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="var(--ink)" />
      <rect x="6" y="14" width="4" height="8" rx="1" fill="var(--debit)" />
      <rect x="12" y="11" width="4" height="11" rx="1" fill="var(--bg)" />
      <rect x="18" y="7" width="4" height="15" rx="1" fill="var(--credit)" />
    </svg>
  );
}
