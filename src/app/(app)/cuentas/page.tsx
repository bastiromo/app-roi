import type { Metadata } from "next";
import { LinkButton, PageHeader } from "@/components/ui";
import { formatDate, formatUsdText } from "@/lib/format";
import { AccountsList } from "./accounts-list";
import { accountFormOptions, listAccounts } from "./data";

export const metadata: Metadata = { title: "Cuentas" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ empresa?: string; estado?: string; guardado?: string }> }) {
  const sp = await searchParams;
  const [accounts, { firms }] = await Promise.all([listAccounts({ firm: sp.empresa, status: sp.estado }), accountFormOptions()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cuentas"
        description="Cada cuenta de evaluación o financiada, con su estado. El tamaño nominal es solo referencia."
        action={<LinkButton href="/cuentas/nueva">Agregar cuenta</LinkButton>}
      />
      <AccountsList
        saved={Boolean(sp.guardado)}
        filter={{ empresa: sp.empresa, estado: sp.estado }}
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
        }))}
      />
    </div>
  );
}
