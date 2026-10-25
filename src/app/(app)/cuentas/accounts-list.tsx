"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Notice, Tag } from "@/components/ui";
import { PHASE_LABEL, STATUS_LABEL, STATUSES } from "@/domain/schemas";
import { deleteAccounts, type DeleteResult, restoreAccounts } from "./actions";

export interface AccountListRow {
  id: string;
  label: string;
  externalId: string | null;
  originLabel: string | null;
  firmName: string;
  planName: string | null;
  nominal: string | null; // ya formateado
  phase: keyof typeof PHASE_LABEL;
  status: keyof typeof STATUS_LABEL;
  opened: string; // ya formateado
  closed: string | null; // ya formateado
}

const STATUS_TONE: Record<AccountListRow["status"], "neutral" | "credit" | "debit"> = {
  activa: "credit",
  aprobada: "credit",
  suspendida: "neutral",
  perdida: "debit",
  cerrada: "neutral",
};

export function AccountsList(props: {
  rows: AccountListRow[];
  firms: { id: string; name: string }[];
  filter: { empresa?: string; estado?: string };
  saved: boolean;
}) {
  const { rows, firms, filter } = props;
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<DeleteResult | null>(null);
  const [pending, startTransition] = useTransition();
  const filtered = Boolean(filter.empresa || filter.estado);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function remove(ids: string[]) {
    const names = rows.filter((r) => ids.includes(r.id)).map((r) => r.label);
    const question =
      ids.length === 1 ? `¿Eliminar la cuenta ${names[0]}?` : `¿Eliminar ${ids.length} cuentas?\n\n${names.join(", ")}`;
    if (!window.confirm(question)) return;
    startTransition(async () => {
      const r = await deleteAccounts(ids);
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
      const r = await restoreAccounts(ids);
      setResult(r);
      router.refresh();
    });
  }

  const allSelected = rows.length > 0 && selected.size === rows.length;

  return (
    <div className="space-y-6">
      {props.saved && !result && <Notice tone="success">Cuenta guardada.</Notice>}
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
            <select name="empresa" defaultValue={filter.empresa ?? ""} className="h-10 rounded-full border border-line bg-surface px-3">
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
            <select name="estado" defaultValue={filter.estado ?? ""} className="h-10 rounded-full border border-line bg-surface px-3">
              <option value="">Todos</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <button className="h-10 rounded-full border border-line bg-surface px-4 text-sm font-medium hover:border-ink-3">Filtrar</button>
          {filtered && (
            <Link href="/cuentas" className="h-10 px-2 text-sm leading-10 text-ink-2 hover:text-ink">
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
          <h2 className="font-semibold">{filtered ? "Ninguna cuenta coincide con los filtros" : "Aún no hay cuentas"}</h2>
          <p className="mt-2 text-sm text-ink-2">
            {filtered ? "Prueba con otra empresa o estado." : "Agrega tu primera cuenta, o espera la carga de tu historial de Lucid."}
          </p>
        </section>
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[54rem] text-sm">
            <thead className="text-left text-ink-2">
              <tr className="border-b border-line">
                {selecting && (
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todas"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                      className="size-4 accent-[var(--ink)]"
                    />
                  </th>
                )}
                <th className="px-4 py-3 font-medium">Cuenta</th>
                <th className="px-4 py-3 font-medium">Empresa</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Fase</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Apertura</th>
                <th className="px-4 py-3 font-medium">Cierre o pérdida</th>
                <th className="w-12 px-2 py-3">
                  <span className="sr-only">Eliminar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr
                  key={a.id}
                  className={`border-b border-line last:border-0 ${selected.has(a.id) ? "bg-debit/5" : "hover:bg-surface-2"}`}
                  onClick={selecting ? () => toggle(a.id) : undefined}
                >
                  {selecting && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${a.label}`}
                        checked={selected.has(a.id)}
                        onChange={() => toggle(a.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="size-4 accent-[var(--ink)]"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <Link href={`/cuentas/${a.id}`} className="font-medium text-ink hover:underline" onClick={(e) => selecting && e.preventDefault()}>
                      {a.label}
                    </Link>
                    {a.externalId && <span className="block text-xs text-ink-3">{a.externalId}</span>}
                    {a.originLabel && <span className="block text-xs text-ink-3">de {a.originLabel}</span>}
                  </td>
                  <td className="px-4 py-3">{a.firmName}</td>
                  <td className="px-4 py-3">
                    {a.planName ?? "—"}
                    {a.nominal && <span className="num block text-xs text-ink-3">{a.nominal} nominal</span>}
                  </td>
                  <td className="px-4 py-3">{PHASE_LABEL[a.phase]}</td>
                  <td className="px-4 py-3">
                    <Tag tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Tag>
                  </td>
                  <td className="num px-4 py-3">{a.opened}</td>
                  <td className={`num px-4 py-3 ${a.status === "perdida" ? "text-debit" : ""}`}>{a.closed ?? "—"}</td>
                  <td className="px-2 py-3 text-right">
                    {!selecting && (
                      <button
                        onClick={() => remove([a.id])}
                        disabled={pending}
                        aria-label={`Eliminar ${a.label}`}
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
          </table>
        </div>
      )}
      <p className="text-xs text-ink-3">
        {rows.length} {rows.length === 1 ? "cuenta" : "cuentas"}
      </p>
    </div>
  );
}
