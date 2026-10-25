import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LinkButton, Notice, PageHeader } from "@/components/ui";
import { PHASE_LABEL, STATUS_LABEL } from "@/domain/schemas";
import { formatDate, inputNumber } from "@/lib/format";
import { AccountForm } from "../account-form";
import { accountFormOptions, getAccount } from "../data";

export const metadata: Metadata = { title: "Editar cuenta" };

const when = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" });

export default async function EditAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aprobada?: string }>;
}) {
  const [{ id }, { aprobada }] = await Promise.all([params, searchParams]);
  const [found, options] = await Promise.all([getAccount(id), accountFormOptions()]);
  if (!found) notFound();
  const { account: a, history, fundedFrom, fundedChild } = found;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_16rem]">
      <div className="space-y-8">
        <PageHeader title={a.label} description={`${a.firms?.name ?? ""}${a.external_id ? ` (${a.external_id})` : ""}`} />
        {aprobada && fundedFrom && (
          <Notice tone="success">Cuenta financiada creada. {fundedFrom.label} quedó como aprobada y vinculada a esta cuenta.</Notice>
        )}
        {a.phase === "evaluacion" && a.status === "activa" && (
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-line bg-surface shadow-card p-4">
            <p className="text-sm text-ink-2">¿Pasaste esta evaluación? Crea la cuenta financiada y quedará vinculada.</p>
            <LinkButton href={`/cuentas/${a.id}/aprobar`}>Aprobé esta evaluación</LinkButton>
          </section>
        )}
        <p className="text-sm">
          <Link href={`/gastos/nuevo?cuenta=${a.id}`} className="font-medium text-ink underline">
            Registrar un gasto de esta cuenta
          </Link>
          {a.phase !== "evaluacion" && (
            <>
              {" "}o{" "}
              <Link href={`/payouts/nuevo?cuenta=${a.id}`} className="font-medium text-ink underline">
                un payout
              </Link>
            </>
          )}
        </p>
        {fundedChild && (
          <p className="text-sm text-ink-2">
            Aprobada el {formatDate(a.closed_on)}. Se convirtió en{" "}
            <Link href={`/cuentas/${fundedChild.id}`} className="font-medium text-ink underline">
              {fundedChild.label}
            </Link>
            .
          </p>
        )}
        {fundedFrom && !aprobada && (
          <p className="text-sm text-ink-2">
            Salió de la evaluación{" "}
            <Link href={`/cuentas/${fundedFrom.id}`} className="font-medium text-ink underline">
              {fundedFrom.label}
            </Link>
            .
          </p>
        )}
        <AccountForm
          id={a.id}
          options={options}
          defaults={{
            firm_id: a.firm_id,
            label: a.label,
            external_id: a.external_id ?? "",
            plan_name: a.plan_name ?? "",
            nominal_size: inputNumber(a.nominal_size),
            phase: a.phase,
            status: a.status,
            origin_account_id: a.origin_account_id ?? "",
            opened_on: a.opened_on ?? "",
            closed_on: a.closed_on ?? "",
            notes: a.notes ?? "",
          }}
        />
      </div>

      <aside aria-labelledby="historial" className="lg:pt-16">
        <h2 id="historial" className="mb-3 font-semibold">
          Historial de estado
        </h2>
        <ol className="space-y-3 border-l border-line pl-4">
          {history.map((h) => (
            <li key={h.changed_at} className="text-sm">
              <span className="block text-ink">
                {PHASE_LABEL[h.phase]}, {STATUS_LABEL[h.status].toLowerCase()}
              </span>
              <span className="num text-xs text-ink-3">{when.format(new Date(h.changed_at))}</span>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
