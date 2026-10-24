import type { Metadata } from "next";
import Link from "next/link";
import { LinkButton, Notice, PageHeader, Tag } from "@/components/ui";
import { PHASE_LABEL, STATUS_LABEL, STATUSES } from "@/domain/schemas";
import { formatDate, formatUsdText } from "@/lib/format";
import { accountFormOptions, type AccountRow, listAccounts } from "./data";

export const metadata: Metadata = { title: "Cuentas" };

const STATUS_TONE: Record<AccountRow["status"], "neutral" | "credit" | "debit"> = {
  activa: "credit",
  aprobada: "credit",
  suspendida: "neutral",
  perdida: "debit",
  cerrada: "neutral",
};

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ empresa?: string; estado?: string; guardado?: string }> }) {
  const sp = await searchParams;
  const [accounts, { firms }] = await Promise.all([listAccounts({ firm: sp.empresa, status: sp.estado }), accountFormOptions()]);
  const usedFirms = firms.filter((f) => f.is_configured);
  const filtered = Boolean(sp.empresa || sp.estado);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cuentas"
        description="Cada cuenta de evaluación o financiada, con su estado. El tamaño nominal es solo referencia."
        action={<LinkButton href="/cuentas/nueva">Agregar cuenta</LinkButton>}
      />
      {sp.guardado && <Notice tone="success">Cuenta guardada.</Notice>}

      <form className="flex flex-wrap items-end gap-3" aria-label="Filtros">
        <label className="text-sm">
          <span className="mb-1 block text-ink-2">Empresa</span>
          <select name="empresa" defaultValue={sp.empresa ?? ""} className="h-10 rounded-lg border border-line bg-surface px-3">
            <option value="">Todas</option>
            {usedFirms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-ink-2">Estado</span>
          <select name="estado" defaultValue={sp.estado ?? ""} className="h-10 rounded-lg border border-line bg-surface px-3">
            <option value="">Todos</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <button className="h-10 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:border-ink-3">Filtrar</button>
        {filtered && (
          <Link href="/cuentas" className="h-10 px-2 text-sm leading-10 text-ink-2 hover:text-ink">
            Quitar filtros
          </Link>
        )}
      </form>

      {accounts.length === 0 ? (
        <section className="rounded-xl border border-dashed border-line bg-surface p-6">
          <h2 className="font-semibold">{filtered ? "Ninguna cuenta coincide con los filtros" : "Aún no hay cuentas"}</h2>
          <p className="mt-2 text-sm text-ink-2">
            {filtered ? "Prueba con otra empresa o estado." : "Agrega tu primera cuenta, o espera la carga de tu historial de Lucid."}
          </p>
        </section>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="text-left text-ink-2">
              <tr className="border-b border-line">
                <th className="px-4 py-3 font-medium">Cuenta</th>
                <th className="px-4 py-3 font-medium">Empresa</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Fase</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Apertura</th>
                <th className="px-4 py-3 font-medium">Cierre o pérdida</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/cuentas/${a.id}`} className="font-medium text-ink hover:underline">
                      {a.label}
                    </Link>
                    {a.external_id && <span className="block text-xs text-ink-3">{a.external_id}</span>}
                    {a.origin && <span className="block text-xs text-ink-3">de {a.origin.label}</span>}
                  </td>
                  <td className="px-4 py-3">{a.firms?.name}</td>
                  <td className="px-4 py-3">
                    {a.plan_name ?? "—"}
                    {a.nominal_size && <span className="num block text-xs text-ink-3">{formatUsdText(a.nominal_size)} nominal</span>}
                  </td>
                  <td className="px-4 py-3">{PHASE_LABEL[a.phase]}</td>
                  <td className="px-4 py-3">
                    <Tag tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Tag>
                  </td>
                  <td className="num px-4 py-3">{formatDate(a.opened_on)}</td>
                  <td className={`num px-4 py-3 ${a.status === "perdida" ? "text-debit" : ""}`}>{a.closed_on ? formatDate(a.closed_on) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-3">{accounts.length} {accounts.length === 1 ? "cuenta" : "cuentas"}</p>
    </div>
  );
}
