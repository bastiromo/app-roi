"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Notice, Tag } from "@/components/ui";
import { PAYOUT_STATUS_LABEL, PAYOUT_STATUSES } from "@/domain/schemas";
import { deletePayouts, type PayoutDeleteResult, restorePayouts } from "./actions";

export interface PayoutListRow {
  id: string;
  date: string;
  firm: string;
  account: string;
  status: keyof typeof PAYOUT_STATUS_LABEL;
  gross: string;
  pct: string;
  received: string | null;
  receivedEstimated: boolean;
  pending: string | null; // por cobrar
}

const TONE: Record<PayoutListRow["status"], "neutral" | "credit" | "debit" | "estimate"> = {
  draft: "neutral",
  requested: "estimate",
  approved: "estimate",
  paid: "credit",
  rejected: "debit",
  cancelled: "neutral",
};

export function PayoutsList(props: {
  rows: PayoutListRow[];
  firms: { id: string; name: string }[];
  filter: { empresa?: string; estado?: string };
  totals: { gross: string; received: string; estimated: string | null; pending: string | null };
  saved: boolean;
}) {
  const { rows, firms, filter, totals } = props;
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<PayoutDeleteResult | null>(null);
  const [pending, startTransition] = useTransition();
  const filtered = Boolean(filter.empresa || filter.estado);
  const control = "h-10 rounded-full border border-line bg-surface px-3";

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function remove(ids: string[]) {
    if (!window.confirm(ids.length === 1 ? "¿Eliminar este payout y su monto recibido?" : `¿Eliminar ${ids.length} payouts?`)) return;
    startTransition(async () => {
      const r = await deletePayouts(ids);
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
      setResult(await restorePayouts(ids));
      router.refresh();
    });
  }

  const allSelected = rows.length > 0 && selected.size === rows.length;

  return (
    <div className="space-y-6">
      {props.saved && !result && <Notice tone="success">Payout guardado.</Notice>}
      {result && (
        <div
          role={result.ok ? "status" : "alert"}
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${result.ok ? "border-credit/40 text-credit" : "border-debit/40 text-debit"}`}
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
              {firms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-ink-2">Estado</span>
            <select name="estado" defaultValue={filter.estado ?? ""} className={control}>
              <option value="">Todos</option>
              {PAYOUT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PAYOUT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <button className="h-10 rounded-full border border-line bg-surface px-4 text-sm font-medium hover:border-ink-3">Filtrar</button>
          {filtered && (
            <Link href="/payouts" className="h-10 px-2 text-sm leading-10 text-ink-2 hover:text-ink">
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
              className="h-10 rounded-full border border-line bg-surface px-4 text-sm font-medium hover:border-ink-3"
            >
              {selecting ? "Cancelar selección" : "Seleccionar"}
            </button>
            {selecting && (
              <button
                onClick={() => remove([...selected])}
                disabled={selected.size === 0 || pending}
                className="h-10 rounded-full bg-debit px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
              >
                Eliminar{selected.size > 0 ? ` (${selected.size})` : ""}
              </button>
            )}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-line bg-surface p-6">
          <h2 className="font-semibold">{filtered ? "Ningún payout coincide con los filtros" : "Aún no hay payouts"}</h2>
          <p className="mt-2 text-sm text-ink-2">
            {filtered ? "Prueba con otra empresa o estado." : "Registra tu primer retiro, o espera la carga de tu historial de Lucid."}
          </p>
        </section>
      ) : (
        <div className="relative overflow-x-auto rounded-3xl border border-line bg-surface shadow-card">
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
                <th className="px-4 py-3 font-medium">Cuenta</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Retiro</th>
                <th className="px-4 py-3 text-right font-medium">Tu parte</th>
                <th className="px-4 py-3 text-right font-medium">Recibido</th>
                <th className="w-12 px-2 py-3">
                  <span className="sr-only">Eliminar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  id={r.id}
                  className={`border-b border-line last:border-0 ${selected.has(r.id) ? "bg-debit/5" : "hover:bg-surface-2"}`}
                  onClick={selecting ? () => toggle(r.id) : undefined}
                >
                  {selecting && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar payout"
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                        onClick={(ev) => ev.stopPropagation()}
                        className="size-4 accent-[var(--ink)]"
                      />
                    </td>
                  )}
                  <td className="num whitespace-nowrap px-4 py-3">
                    <Link href={`/payouts/${r.id}`} className="hover:underline" onClick={(ev) => selecting && ev.preventDefault()}>
                      {r.date}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {r.account}
                    <span className="block text-xs text-ink-3">{r.firm}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Tag tone={TONE[r.status]}>{PAYOUT_STATUS_LABEL[r.status]}</Tag>
                  </td>
                  <td className="num whitespace-nowrap px-4 py-3 text-right">{r.gross}</td>
                  <td className="num whitespace-nowrap px-4 py-3 text-right text-ink-2">{r.pct}</td>
                  <td className="num whitespace-nowrap px-4 py-3 text-right font-medium">
                    {r.received ? (
                      <span className={r.receivedEstimated ? "est" : "text-credit"} title={r.receivedEstimated ? "Estimado" : "Monto real"}>
                        +{r.received}
                      </span>
                    ) : r.pending ? (
                      <span className="text-xs font-normal text-ink-3">por cobrar {r.pending}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2 py-3 text-right">
                    {!selecting && (
                      <button
                        onClick={() => remove([r.id])}
                        disabled={pending}
                        aria-label="Eliminar payout"
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
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-surface-2">
                <td colSpan={selecting ? 4 : 3} className="px-4 py-3 text-sm text-ink-2">
                  Totales
                  {totals.pending && <span className="block text-xs">Por cobrar (solicitados o sin recibo): {totals.pending}</span>}
                </td>
                <td className="num px-4 py-3 text-right font-semibold">{totals.gross}</td>
                <td />
                <td className="num px-4 py-3 text-right font-semibold text-credit">
                  {totals.received}
                  {totals.estimated && <span className="block text-xs font-normal text-ink-3">incluye <span className="est">{totals.estimated}</span> estimado</span>}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-3">
        <span className="est">Subrayado punteado</span> = estimado (retiro × tu % − comisión). Edita el payout si conoces el monto exacto.
      </p>
    </div>
  );
}
