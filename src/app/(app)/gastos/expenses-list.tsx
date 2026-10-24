"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Notice, Tag } from "@/components/ui";
import { CATEGORIES, CATEGORY_LABEL } from "@/domain/schemas";
import { deleteExpenses, type ExpenseDeleteResult, restoreExpenses } from "./actions";

export interface ExpenseListRow {
  id: string;
  date: string;
  kind: "cost" | "refund";
  status: "paid" | "pending" | "failed" | "void";
  firm: string;
  account: string | null;
  category: string;
  description: string | null;
  original: string; // "105,20 USD"
  usd: string; // con signo, formateado
  ref: string | null;
}

const STATUS_TAG: Record<ExpenseListRow["status"], { label: string; tone: "neutral" | "debit" | "estimate" } | null> = {
  paid: null,
  pending: { label: "Pendiente", tone: "estimate" },
  failed: { label: "Fallido", tone: "neutral" },
  void: { label: "Anulado", tone: "neutral" },
};

export function ExpensesList(props: {
  rows: ExpenseListRow[];
  firms: { id: string; name: string }[];
  filter: { empresa?: string; categoria?: string; desde?: string; hasta?: string };
  totals: { usd: string; clp: string; count: number };
  saved: boolean;
}) {
  const { rows, firms, filter, totals } = props;
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ExpenseDeleteResult | null>(null);
  const [pending, startTransition] = useTransition();
  const filtered = Boolean(filter.empresa || filter.categoria || filter.desde || filter.hasta);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function remove(ids: string[]) {
    if (!window.confirm(ids.length === 1 ? "¿Eliminar este gasto?" : `¿Eliminar ${ids.length} gastos?`)) return;
    startTransition(async () => {
      const r = await deleteExpenses(ids);
      setResult(r);
      if (r.ok) {
        setSelected(new Set());
        setSelecting(false);
        router.refresh();
      }
    });
  }

  function undo(ids: string[]) {
    startTransition(async () => {
      setResult(await restoreExpenses(ids));
      router.refresh();
    });
  }

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const control = "h-10 rounded-lg border border-line bg-surface px-3";

  return (
    <div className="space-y-6">
      {props.saved && !result && <Notice tone="success">Guardado.</Notice>}
      {result && (
        <div
          role={result.ok ? "status" : "alert"}
          className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${result.ok ? "border-credit/40 text-credit" : "border-debit/40 text-debit"}`}
        >
          <span>{result.message}</span>
          {result.ok && result.ids && (
            <button onClick={() => undo(result.ids!)} disabled={pending} className="font-semibold text-ink underline">
              Deshacer
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <form className="flex flex-wrap items-end gap-3" aria-label="Filtros">
          <label className="text-sm">
            <span className="mb-1 block text-ink-2">Empresa</span>
            <select name="empresa" defaultValue={filter.empresa ?? ""} className={control}>
              <option value="">Todas</option>
              <option value="general">General</option>
              {firms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-ink-2">Categoría</span>
            <select name="categoria" defaultValue={filter.categoria ?? ""} className={control}>
              <option value="">Todas</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-ink-2">Desde</span>
            <input type="date" name="desde" defaultValue={filter.desde} className={control} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-ink-2">Hasta</span>
            <input type="date" name="hasta" defaultValue={filter.hasta} className={control} />
          </label>
          <button className="h-10 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:border-ink-3">Filtrar</button>
          {filtered && (
            <Link href="/gastos" className="h-10 px-2 text-sm leading-10 text-ink-2 hover:text-ink">
              Quitar filtros
            </Link>
          )}
        </form>
        {rows.length > 0 && (
          <div className="flex items-end gap-2">
            <button
              onClick={() => {
                setSelecting((s) => !s);
                setSelected(new Set());
              }}
              aria-pressed={selecting}
              className="h-10 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:border-ink-3"
            >
              {selecting ? "Cancelar selección" : "Seleccionar"}
            </button>
            {selecting && (
              <button
                onClick={() => remove([...selected])}
                disabled={selected.size === 0 || pending}
                className="h-10 rounded-lg bg-debit px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
              >
                Eliminar{selected.size > 0 ? ` (${selected.size})` : ""}
              </button>
            )}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <section className="rounded-xl border border-dashed border-line bg-surface p-6">
          <h2 className="font-semibold">{filtered ? "Ningún gasto coincide con los filtros" : "Aún no hay gastos"}</h2>
          <p className="mt-2 text-sm text-ink-2">
            {filtered ? "Prueba con otro rango o categoría." : "Registra tu primera evaluación, o espera la carga de tu historial de Lucid."}
          </p>
        </section>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[54rem] text-sm">
            <thead className="text-left text-ink-2">
              <tr className="border-b border-line">
                {selecting && (
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                      className="size-4 accent-[var(--ink)]"
                    />
                  </th>
                )}
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Empresa</th>
                <th className="px-4 py-3 font-medium">Categoría</th>
                <th className="px-4 py-3 text-right font-medium">Monto</th>
                <th className="px-4 py-3 text-right font-medium">En USD</th>
                <th className="w-12 px-2 py-3">
                  <span className="sr-only">Eliminar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tag = STATUS_TAG[r.status];
                const muted = r.status !== "paid";
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-line last:border-0 ${selected.has(r.id) ? "bg-debit/5" : "hover:bg-surface-2"} ${muted ? "text-ink-3" : ""}`}
                    onClick={selecting ? () => toggle(r.id) : undefined}
                  >
                    {selecting && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label="Seleccionar gasto"
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                          onClick={(ev) => ev.stopPropagation()}
                          className="size-4 accent-[var(--ink)]"
                        />
                      </td>
                    )}
                    <td className="num whitespace-nowrap px-4 py-3">
                      <Link href={`/gastos/${r.id}`} className="hover:underline" onClick={(ev) => selecting && ev.preventDefault()}>
                        {r.date}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {r.firm}
                      {r.account && <span className="block text-xs text-ink-3">{r.account}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap items-center gap-2">
                        {r.kind === "refund" ? "Reembolso" : CATEGORY_LABEL[r.category as keyof typeof CATEGORY_LABEL]}
                        {tag && <Tag tone={tag.tone}>{tag.label}</Tag>}
                      </span>
                      {(r.description || r.ref) && (
                        <span className="block text-xs text-ink-3">{[r.description, r.ref && `#${r.ref}`].filter(Boolean).join(", ")}</span>
                      )}
                    </td>
                    <td className="num whitespace-nowrap px-4 py-3 text-right">{r.original}</td>
                    <td
                      className={`num whitespace-nowrap px-4 py-3 text-right font-medium ${muted ? "line-through" : r.kind === "refund" ? "text-credit" : "text-debit"}`}
                    >
                      {r.usd}
                    </td>
                    <td className="px-2 py-3 text-right">
                      {!selecting && (
                        <button
                          onClick={() => remove([r.id])}
                          disabled={pending}
                          aria-label="Eliminar gasto"
                          title="Eliminar"
                          className="inline-grid size-8 place-items-center rounded-md text-ink-3 hover:bg-debit/10 hover:text-debit"
                        >
                          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-surface-2">
                <td colSpan={selecting ? 5 : 4} className="px-4 py-3 text-sm text-ink-2">
                  Total pagado ({totals.count} {totals.count === 1 ? "movimiento" : "movimientos"}, reembolsos descontados)
                </td>
                <td className="num px-4 py-3 text-right font-semibold text-debit">
                  {totals.usd}
                  <span className="block text-xs font-normal text-ink-3">{totals.clp}</span>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
