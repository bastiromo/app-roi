import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const control =
  "w-full rounded-xl border border-line bg-surface px-3.5 text-base text-ink placeholder:text-ink-3 focus:border-focus focus:outline-none aria-[invalid=true]:border-debit";

function Label({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-2">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-debit">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>
      )}
    </label>
  );
}

type Extra = { label: string; hint?: string; error?: string };

export function Field({ label, hint, error, ...props }: InputHTMLAttributes<HTMLInputElement> & Extra) {
  return (
    <Label label={label} hint={hint} error={error}>
      <input {...props} aria-invalid={error ? true : undefined} className={`h-11 ${control}`} />
    </Label>
  );
}

export function Select({ label, hint, error, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & Extra) {
  return (
    <Label label={label} hint={hint} error={error}>
      <select {...props} aria-invalid={error ? true : undefined} className={`h-11 ${control}`}>
        {children}
      </select>
    </Label>
  );
}

export function TextArea({ label, hint, error, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & Extra) {
  return (
    <Label label={label} hint={hint} error={error}>
      <textarea {...props} rows={props.rows ?? 3} aria-invalid={error ? true : undefined} className={`py-2 ${control}`} />
    </Label>
  );
}

export function Check({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" {...props} className="mt-1 size-4 accent-[var(--ink)]" />
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </span>
    </label>
  );
}

export function Button({ children, variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" }) {
  const styles =
    variant === "primary"
      ? "bg-ink text-bg hover:opacity-90 disabled:opacity-50"
      : "text-ink-2 hover:text-ink hover:bg-surface-2";
  return (
    <button {...props} className={`h-11 rounded-full px-5 text-sm font-semibold transition-opacity ${styles} ${props.className ?? ""}`}>
      {children}
    </button>
  );
}

export function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-bg transition-opacity hover:opacity-90">
      {children}
    </Link>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success"; children: ReactNode }) {
  const tones = { info: "border-line text-ink-2", error: "border-debit/40 text-debit", success: "border-credit/40 text-credit" };
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-3.5 py-2.5 text-sm ${tones[tone]}`}>
      {children}
    </p>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-4xl">{title}</h1>
        {description && <p className="mt-1 max-w-prose text-sm text-ink-2">{description}</p>}
      </div>
      {action}
    </header>
  );
}

/** Etiqueta pequeña de estado. "estimate" usa el mismo ámbar que los montos estimados. */
export function Tag({ tone = "neutral", children }: { tone?: "neutral" | "credit" | "debit" | "estimate"; children: ReactNode }) {
  const tones = {
    neutral: "text-ink-2 border-line",
    credit: "text-credit border-credit/40",
    debit: "text-debit border-debit/40",
    estimate: "text-estimate border-estimate/50 border-dashed",
  };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

/** Tarjeta base del sistema: muy redondeada, borde suave y sombra leve. */
export function Card({ children, className = "", tone = "surface" }: { children: ReactNode; className?: string; tone?: "surface" | "hero" }) {
  const t = tone === "hero" ? "bg-hero text-hero-ink border-transparent" : "bg-surface border-line";
  return <section className={`rounded-3xl border p-5 shadow-card md:p-6 ${t} ${className}`}>{children}</section>;
}

/** Control segmentado de enlaces (filtros por URL): píldora gris con la opción activa en blanco. */
export function Segmented({ items, label }: { items: { href: string; label: string; active: boolean }[]; label: string }) {
  return (
    <nav aria-label={label} className="inline-flex rounded-full bg-surface-2 p-1 shadow-[inset_0_0_0_1px_var(--line)]">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          scroll={false}
          aria-current={i.active ? "page" : undefined}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors md:px-4 ${
            i.active ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink"
          }`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Chip de variación (↑ verde / ↓ carmín). good = si subir es bueno (en costos, subir es malo).
 * La flecha y el signo acompañan al color: nunca solo color.
 */
export function Delta({ text, up, good = true, onHero = false }: { text: string; up: boolean; good?: boolean; onHero?: boolean }) {
  const positive = up === good;
  const tone = onHero
    ? positive
      ? "bg-hero-credit/15 text-hero-credit"
      : "bg-hero-debit/15 text-hero-debit"
    : positive
      ? "bg-credit-bg text-credit"
      : "bg-debit-bg text-debit";
  return (
    <span className={`num inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" className={up ? "" : "rotate-180"}>
        <path d="M6 10V2M2.5 5.5 6 2l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">{up ? "subió" : "bajó"}</span>
      {text}
    </span>
  );
}
