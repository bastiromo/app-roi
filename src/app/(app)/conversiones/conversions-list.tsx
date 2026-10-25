"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Notice } from "@/components/ui";
import { deleteConversion, restoreConversion } from "./actions";

export interface ConversionListRow {
  id: string;
  date: string;
  where: string;
  ref: string | null;
  sold: string;
  pesos: string;
  price: string;
  diff: string | null;
  diffPositive: boolean;
}

export function ConversionsList({ rows }: { rows: ConversionListRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string; id?: string } | null>(null);

  function remove(id: string) {
    if (!window.confirm("¿Eliminar esta venta?")) return;
    startTransition(async () => {
      const r = await deleteConversion(id);
      setResult({ ...r, id: r.ok ? id : undefined });
      router.refresh();
    });
  }
  function undo(id: string) {
    startTransition(async () => {
      setResult(await restoreConversion(id));
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="ventas" className="space-y-3">
      <h2 id="ventas" className="font-semibold">
        Ventas registradas
      </h2>
      {result && (
        <Notice tone={result.ok ? "success" : "error"}>
          {result.message}{" "}
          {result.id && (
            <button type="button" onClick={() => undo(result.id!)} disabled={pending} className="font-medium underline">
              Deshacer
            </button>
          )}
        </Notice>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-ink-2">Aún no registras ventas.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink-2">
                  {r.date} · {r.where}
                  {r.ref && <span className="text-ink-3"> · n.º {r.ref}</span>}
                </p>
                <p className="num mt-0.5 font-medium text-ink">
                  {r.sold} → {r.pesos}
                </p>
                <p className="num text-xs text-ink-3">
                  {r.price} por unidad
                  {r.diff && (
                    <>
                      {" · "}
                      <span className={r.diffPositive ? "text-credit" : "text-debit"}>{r.diff}</span> vs dólar observado
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(r.id)}
                disabled={pending}
                aria-label={`Eliminar venta del ${r.date}`}
                className="-mr-2 grid size-10 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-debit"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
