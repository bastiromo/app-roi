/** Marca: tres barras (sale, neutro, entra) sobre una píldora tinta. */
export function LedgerMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="9" fill="var(--ink)" />
      <rect x="7" y="14" width="3.5" height="7" rx="1.75" fill="var(--bg)" opacity="0.55" />
      <rect x="12.25" y="10.5" width="3.5" height="10.5" rx="1.75" fill="var(--bg)" opacity="0.8" />
      <rect x="17.5" y="7" width="3.5" height="14" rx="1.75" fill="var(--bg)" />
    </svg>
  );
}
