import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Field({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-2">{label}</span>
      <input
        {...props}
        className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink placeholder:text-ink-3 focus:border-focus focus:outline-none"
      />
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
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

export function Notice({ tone = "info", children }: { tone?: "info" | "error"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border px-3 py-2 text-sm ${tone === "error" ? "border-debit/40 text-debit" : "border-line text-ink-2"}`}
    >
      {children}
    </p>
  );
}
