import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const control =
  "w-full rounded-lg border border-line bg-surface px-3 text-base text-ink placeholder:text-ink-3 focus:border-focus focus:outline-none aria-[invalid=true]:border-debit";

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
    <button {...props} className={`h-11 rounded-lg px-4 text-sm font-semibold transition-opacity ${styles} ${props.className ?? ""}`}>
      {children}
    </button>
  );
}

export function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex h-10 items-center rounded-lg bg-ink px-4 text-sm font-semibold text-bg hover:opacity-90">
      {children}
    </Link>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success"; children: ReactNode }) {
  const tones = { info: "border-line text-ink-2", error: "border-debit/40 text-debit", success: "border-credit/40 text-credit" };
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${tones[tone]}`}>
      {children}
    </p>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
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
  return <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}
