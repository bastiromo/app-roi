import type { Metadata } from "next";
import { LinkButton, PageHeader } from "@/components/ui";
import { STATUSES } from "@/domain/schemas";
import { formatDate, formatUsdText } from "@/lib/format";
import { AccountsList } from "./accounts-list";
import { accountFormOptions, accountWithdrawals, listAccounts } from "./data";

export const metadata: Metadata = { title: "Cuentas" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ empresa?: string; estado?: string; guardado?: string }> }) {
  const sp = await searchParams;
  // Todas las cuentas de la empresa: las pestañas de estado filtran en la pantalla, sin recargar.
  // ?estado= solo elige la pestaña inicial (ej. desde "cuentas activas" del Resumen).
  const estado = (STATUSES as readonly string[]).includes(sp.estado ?? "") ? sp.estado : undefined;
  const [accounts, { firms }, wd] = await Promise.all([listAccounts({ firm: sp.empresa }), accountFormOptions(), accountWithdrawals()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cuentas"
        description="Tus financiadas y tus evaluaciones, por separado. El tamaño nominal es solo referencia."
        action={<LinkButton href="/cuentas/nueva">Agregar cuenta</LinkButton>}
      />
      <AccountsList
        saved={Boolean(sp.guardado)}
        filter={{ empresa: sp.empresa, estado }}
        firms={firms.filter((f) => f.is_configured).map((f) => ({ id: f.id, name: f.name }))}
        rows={accounts.map((a) => ({
          id: a.id,
          label: a.label,
          externalId: a.external_id,
          originLabel: a.origin?.label ?? null,
          firmName: a.firms?.name ?? "",
          planName: a.plan_name,
          nominal: a.nominal_size ? formatUsdText(a.nominal_size) : null,
          phase: a.phase,
          status: a.status,
          opened: formatDate(a.opened_on),
          closed: a.closed_on ? formatDate(a.closed_on) : null,
          closedOn: a.closed_on,
          withdrawals:
            a.phase === "evaluacion"
              ? null
              : { ...(wd.counts.get(a.id) ?? { paid: 0, inProcess: 0 }), max: wd.maxFor(a.firm_id) },
        }))}
      />
    </div>
  );
}
