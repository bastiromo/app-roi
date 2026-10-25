"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Notice, Tag } from "@/components/ui";
import { BULK_STATUSES, PHASE_LABEL, STATUS_LABEL, STATUSES } from "@/domain/schemas";
import { withdrawalStage } from "@/domain/withdrawals";
import { deleteAccounts, type DeleteResult, restoreAccounts, restoreAccountsStatus, setAccountsStatus, type StatusResult } from "./actions";

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
  closedOn: string | null; // AAAA-MM-DD
  /** Solo financiadas/live: retiros pagados, en proceso y máximo de su empresa (null = sin límite). */
  withdrawals: { paid: number; inProcess: number; max: number | null } | null;
}

type Status = AccountListRow["status"];
type Tab = Status | "todas";

const STATUS_TONE: Record<Status, "neutral" | "credit" | "debit"> = {
  activa: "credit",
  aprobada: "credit",
  suspendida: "neutral",
  perdida: "debit",
  cerrada: "neutral",
};
const TAB_LABEL: Record<Status, string> = {
  activa: "Activas",
  aprobada: "Aprobadas",
  suspendida: "Suspendidas",
  perdida: "Perdidas",
  cerrada: "Cerradas",
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
  const [result, setResult] = useState<(DeleteResult & StatusResult) | null>(null);
  const [pending, startTransition] = useTransition();
  const [newStatus, setNewStatus] = useState<string>("perdida");
  // Hoy en Chile (solo para proponer la fecha de cierre)
  const [closeDate, setCloseDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date()));
  const closes = newStatus === "perdida" || newStatus === "cerrada";
  const initialTab: Tab = (STATUSES as readonly string[]).includes(filter.estado ?? "") ? (filter.estado as Status) : "activa";

  const funded = rows.filter((r) => r.phase !== "evaluacion");
  const evaluations = rows.filter((r) => r.phase === "evaluacion");

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleMany(ids: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
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
      setResult(await restoreAccounts(ids));
      router.refresh();
    });
  }

  function changeStatus() {
    const ids = [...selected];
    const label = STATUS_LABEL[newStatus as Status];
    if (!window.confirm(ids.length === 1 ? `¿Marcar la cuenta como ${label}?` : `¿Marcar ${ids.length} cuentas como ${label}?`)) return;
    startTransition(async () => {
      const r = await setAccountsStatus(ids, newStatus, closeDate);
      setResult(r);
      if (r.ok) {
        setSelected(new Set());
        setSelecting(false);
        router.refresh();
      }
    });
  }

  function undoStatus(previous: NonNullable<StatusResult["previous"]>) {
    startTransition(async () => {
      setResult(await restoreAccountsStatus(previous));
      router.refresh();
    });
  }

  const tableProps = { selecting, selected, toggle, toggleMany, remove, pending };

  return (
    <div className={`space-y-6 ${selecting ? "pb-56 md:pb-0" : ""}`}>
      {props.saved && !result && <Notice tone="success">Cuenta guardada.</Notice>}
      {result && (
        <div
          role={result.ok ? "status" : "alert"}
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${result.ok ? "border-credit/40 text-credit" : "border-debit/40 text-debit"}`}
        >
          <span>{result.message}</span>
          {result.ok && (result.ids || result.previous) && (
            <button
              onClick={() => (result.previous ? undoStatus(result.previous) : undo(result.ids!))}
              disabled={pending}
              className="font-semibold text-ink underline"
            >
              Deshacer
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <form aria-label="Filtro por empresa">
          <label className="text-sm">
            <span className="mb-1 block text-ink-2">Empresa</span>
            {/* Se aplica al elegir: sin botón "Filtrar" */}
            <select
              name="empresa"
              defaultValue={filter.empresa ?? ""}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="h-10 rounded-full border border-line bg-surface px-3"
            >
              <option value="">Todas</option>
              {firms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
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

      {selecting && (
        <div
          className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-2 items-end gap-2 rounded-3xl border border-line bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_12px_40px_-12px_rgb(0_0_0/0.35)] md:sticky md:inset-x-auto md:top-20 md:bottom-auto md:flex md:flex-wrap md:gap-3 md:p-4"
          role="group"
          aria-label="Cambiar estado de las seleccionadas"
        >
          <p className="col-span-2 text-sm text-ink-2 md:w-full">
            {selected.size === 0
              ? "Toca las cuentas que quieras cambiar."
              : `${selected.size} ${selected.size === 1 ? "cuenta seleccionada" : "cuentas seleccionadas"}`}
          </p>
          <label className={`text-sm ${closes ? "" : "col-span-2"}`}>
            <span className="mb-1 block text-ink-2">Cambiar estado a</span>
            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="h-10 w-full rounded-full border border-line bg-surface px-3 md:w-auto">
              {BULK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          {closes && (
            <label className="text-sm">
              <span className="mb-1 block text-ink-2">{newStatus === "perdida" ? "Fecha de pérdida" : "Fecha de cierre"}</span>
              <input
                type="date"
                value={closeDate}
                onChange={(e) => setCloseDate(e.target.value)}
                className="h-10 w-full min-w-0 rounded-full border border-line bg-surface px-3 md:w-auto"
              />
            </label>
          )}
          <button
            onClick={changeStatus}
            disabled={selected.size === 0 || pending || (closes && !closeDate)}
            className="col-span-2 h-11 rounded-full bg-ink px-4 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-40 md:h-10"
          >
            Aplicar{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-line bg-surface p-6">
          <h2 className="font-semibold">{filter.empresa ? "Esta empresa aún no tiene cuentas" : "Aún no hay cuentas"}</h2>
          <p className="mt-2 text-sm text-ink-2">Agrega tu primera cuenta o importa tu historial.</p>
        </section>
      ) : (
        <>
          <AccountSection
            key={`f-${initialTab}`}
            title="Financiadas"
            hint="Cuentas que ya pasaron la evaluación (incluye live)."
            rows={funded}
            initialTab={initialTab}
            kind="funded"
            {...tableProps}
          />
          <AccountSection
            key={`e-${initialTab}`}
            title="Evaluaciones"
            hint="Las que estás intentando pasar. Las perdidas quedan en su pestaña, sin estorbar."
            rows={evaluations}
            initialTab={initialTab}
            kind="evaluations"
            {...tableProps}
          />
        </>
      )}
    </div>
  );
}

interface TableProps {
  selecting: boolean;
  selected: Set<string>;
  toggle: (id: string) => void;
  toggleMany: (ids: string[], on: boolean) => void;
  remove: (ids: string[]) => void;
  pending: boolean;
}

/** Una sección (financiadas o evaluaciones) con pestañas por estado y su contador. */
function AccountSection(props: TableProps & { title: string; hint: string; rows: AccountListRow[]; initialTab: Tab; kind: "funded" | "evaluations" }) {
  const { rows, kind } = props;
  const counts = new Map<Status, number>();
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const tabs: Tab[] = [...STATUSES.filter((s) => counts.get(s)), "todas"];
  const [tab, setTab] = useState<Tab>(props.initialTab);
  // Si la pestaña elegida queda vacía (por ejemplo, tras marcar todas como perdidas), se ve "Todas"
  const current: Tab = tab === "todas" || counts.get(tab) ? tab : "todas";
  const visible = current === "todas" ? rows : rows.filter((r) => r.status === current);
  const id = `seccion-${kind}`;

  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={id} className="text-xl font-semibold tracking-tight">
            {props.title} <span className="num text-ink-3">{rows.length}</span>
          </h2>
          <p className="text-sm text-ink-2">{props.hint}</p>
        </div>
        {rows.length > 0 && (
          <div role="tablist" aria-label={`Estado de ${props.title.toLowerCase()}`} className="inline-flex max-w-full overflow-x-auto rounded-full bg-surface-2 p-1 shadow-[inset_0_0_0_1px_var(--line)]">
            {tabs.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={current === t}
                onClick={() => setTab(t)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors md:px-3.5 ${
                  current === t ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink"
                }`}
              >
                {t === "todas" ? "Todas" : TAB_LABEL[t]} <span className="num text-ink-3">{t === "todas" ? rows.length : counts.get(t)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-line bg-surface px-5 py-4 text-sm text-ink-2">
          {kind === "funded" ? "Aún no tienes cuentas financiadas. Cuando apruebes una evaluación, aparece aquí." : "Sin evaluaciones."}
        </p>
      ) : (
        <AccountTable {...props} rows={visible} kind={kind} />
      )}
    </section>
  );
}

function AccountTable({ rows, kind, selecting, selected, toggle, toggleMany, remove, pending }: TableProps & { rows: AccountListRow[]; kind: "funded" | "evaluations" }) {
  const ids = rows.map((r) => r.id);
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  const del = (a: AccountListRow) =>
    !selecting && (
      <button
        onClick={() => remove([a.id])}
        disabled={pending}
        aria-label={`Eliminar ${a.label}`}
        title="Eliminar"
        className="inline-grid size-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-debit/10 hover:text-debit"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    );
  return (
    <>
    {/* Celular: una fila compacta por cuenta, todo a la vista (sin desplazar hacia el lado) */}
    <div className="rounded-3xl border border-line bg-surface shadow-card md:hidden">
      {selecting && (
        <label className="flex items-center gap-3 border-b border-line px-4 py-3 text-sm text-ink-2">
          <input type="checkbox" checked={allSelected} onChange={() => toggleMany(ids, !allSelected)} className="size-4 accent-[var(--ink)]" />
          Seleccionar todas las de esta lista
        </label>
      )}
      <ul className="divide-y divide-line">
        {rows.map((a) => (
          <li
            key={a.id}
            className={`flex items-center gap-3 px-4 py-3 ${selected.has(a.id) ? "bg-ink/[0.06]" : ""}`}
            onClick={selecting ? () => toggle(a.id) : undefined}
          >
            {selecting && (
              <input
                type="checkbox"
                aria-label={`Seleccionar ${a.label}`}
                checked={selected.has(a.id)}
                onChange={() => toggle(a.id)}
                onClick={(e) => e.stopPropagation()}
                className="size-4 shrink-0 accent-[var(--ink)]"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/cuentas/${a.id}`} className="truncate font-medium text-ink" onClick={(e) => selecting && e.preventDefault()}>
                  {a.label}
                </Link>
                <Tag tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Tag>
              </div>
              <p className="truncate text-xs text-ink-3">
                {a.firmName}
                {kind === "evaluations" ? a.planName && ` · ${a.planName}` : a.phase === "live" && " · Live"}
                {a.originLabel && ` · de ${a.originLabel}`}
              </p>
              <p className="num text-xs text-ink-3">
                {a.opened}
                {a.closed && <span className={a.status === "perdida" ? "text-debit" : ""}> → {a.closed}</span>}
              </p>
              {a.withdrawals && (
                <div className="mt-1.5">
                  <WithdrawalCell a={a} selecting={selecting} />
                </div>
              )}
            </div>
            {del(a)}
          </li>
        ))}
      </ul>
    </div>
    <div className="relative hidden overflow-x-auto rounded-3xl border border-line bg-surface shadow-card md:block">
      <table className={`w-full text-sm ${kind === "funded" ? "min-w-[54rem]" : "min-w-[46rem]"}`}>
        <thead className="text-left text-ink-2">
          <tr className="border-b border-line">
            {selecting && (
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todas las de esta lista"
                  checked={allSelected}
                  onChange={() => toggleMany(ids, !allSelected)}
                  className="size-4 accent-[var(--ink)]"
                />
              </th>
            )}
            <th className="px-4 py-3 font-medium">Cuenta</th>
            <th className="px-4 py-3 font-medium">Empresa</th>
            {kind === "evaluations" ? <th className="px-4 py-3 font-medium">Plan</th> : <th className="px-4 py-3 font-medium">Fase</th>}
            <th className="px-4 py-3 font-medium">Estado</th>
            <th className="px-4 py-3 font-medium">{kind === "funded" ? "Desde" : "Apertura"}</th>
            <th className="px-4 py-3 font-medium">Cierre o pérdida</th>
            {kind === "funded" && <th className="px-4 py-3 font-medium">Retiros</th>}
            <th className="w-12 px-2 py-3">
              <span className="sr-only">Eliminar</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr
              key={a.id}
              className={`border-b border-line last:border-0 ${selected.has(a.id) ? "bg-ink/[0.06]" : "hover:bg-surface-2"}`}
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
              {kind === "evaluations" ? (
                <td className="px-4 py-3">
                  {a.planName ?? "—"}
                  {a.nominal && <span className="num block text-xs text-ink-3">{a.nominal} nominal</span>}
                </td>
              ) : (
                <td className="px-4 py-3">{PHASE_LABEL[a.phase]}</td>
              )}
              <td className="px-4 py-3">
                <Tag tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Tag>
              </td>
              <td className="num px-4 py-3">{a.opened}</td>
              <td className={`num px-4 py-3 ${a.status === "perdida" ? "text-debit" : ""}`}>{a.closed ?? "—"}</td>
              {kind === "funded" && (
                <td className="px-4 py-3">
                  <WithdrawalCell a={a} selecting={selecting} />
                </td>
              )}
              <td className="px-2 py-3 text-right">{del(a)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

/** Retiros de una financiada: puntos (pagado ● / en proceso ◐ / disponible ○), "1 de 4" y botón para registrar el siguiente. */
function WithdrawalCell({ a, selecting }: { a: AccountListRow; selecting: boolean }) {
  const w = a.withdrawals;
  if (!w) return null;
  const { used, left, stage } = withdrawalStage(w, w.max);
  const canAdd = a.status === "activa" && stage !== "done" && !selecting;
  const dots = w.max !== null && w.max <= 10;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {dots && (
        <span className="flex items-center gap-1" aria-hidden="true">
          {Array.from({ length: w.max! }, (_, i) => (
            <span
              key={i}
              className={`inline-block size-2.5 rounded-full ${
                i < w.paid
                  ? stage === "done"
                    ? "bg-debit"
                    : "bg-ink"
                  : i < used
                    ? "border border-ink bg-[linear-gradient(90deg,var(--ink)_50%,transparent_50%)]"
                    : "border border-ink-3/60"
              }`}
            />
          ))}
        </span>
      )}
      <span className="num text-sm font-medium text-ink">
        {w.max === null ? `${used} ${used === 1 ? "retiro" : "retiros"}` : `${used} de ${w.max}`}
      </span>
      {stage === "last" && a.status === "activa" && <Tag tone="estimate">Queda 1</Tag>}
      {stage === "done" && a.status === "activa" && <Tag tone="debit">Completa: ciérrala</Tag>}
      {canAdd && (
        <Link
          href={`/payouts/nuevo?cuenta=${a.id}`}
          aria-label={`Registrar un retiro de ${a.label}`}
          title="Registrar retiro"
          className="inline-grid size-7 place-items-center rounded-full border border-line text-ink-2 transition-colors hover:border-ink hover:bg-ink hover:text-bg"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </Link>
      )}
      {w.inProcess > 0 && <span className="w-full text-xs text-ink-3">{w.inProcess} en proceso</span>}
      <span className="sr-only">
        {w.paid} pagados{w.inProcess ? `, ${w.inProcess} en proceso` : ""}
        {left !== null ? `, quedan ${left}` : ""}
      </span>
    </div>
  );
}
