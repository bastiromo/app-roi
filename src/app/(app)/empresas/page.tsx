import type { Metadata } from "next";
import Link from "next/link";
import { LinkButton, Notice, PageHeader, Tag } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatRate, formatUsdText } from "@/lib/format";
import { type FirmRow, listFirms } from "./data";

export const metadata: Metadata = { title: "Empresas" };

function ruleText(f: FirmRow) {
  if (f.split_tier_threshold && f.split_tier_pct_before) {
    return `${formatRate(f.split_tier_pct_before)} hasta ${formatUsdText(f.split_tier_threshold)}, luego ${formatRate(f.default_trader_share_pct)}`;
  }
  return formatRate(f.default_trader_share_pct);
}

export default async function FirmsPage({ searchParams }: { searchParams: Promise<{ guardado?: string }> }) {
  const [{ guardado }, firms, { supabase }] = await Promise.all([searchParams, listFirms(), requireUser()]);
  const { data: counts } = await supabase.from("accounts").select("firm_id").is("deleted_at", null).returns<{ firm_id: string }[]>();
  const accountsByFirm = new Map<string, number>();
  for (const a of counts ?? []) accountsByFirm.set(a.firm_id, (accountsByFirm.get(a.firm_id) ?? 0) + 1);

  const mine = firms.filter((f) => f.is_configured);
  const catalog = firms.filter((f) => !f.is_configured);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Empresas"
        description="Reglas de reparto y comisión de cada empresa. Se usan para estimar lo que recibes de cada payout."
        action={<LinkButton href="/empresas/nueva">Agregar empresa</LinkButton>}
      />
      {guardado && <Notice tone="success">Empresa guardada.</Notice>}

      <section aria-labelledby="mis-empresas">
        <h2 id="mis-empresas" className="mb-3 font-semibold">
          Configuradas
        </h2>
        <div className="relative overflow-x-auto rounded-3xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-ink-2">
              <tr className="border-b border-line">
                <th className="px-4 py-3 font-medium">Empresa</th>
                <th className="px-4 py-3 font-medium">Tu parte</th>
                <th className="px-4 py-3 font-medium">Comisión por retiro</th>
                <th className="px-4 py-3 text-right font-medium">Cuentas</th>
              </tr>
            </thead>
            <tbody>
              {mine.map((f) => (
                <tr key={f.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/empresas/${f.id}`} className="font-medium text-ink hover:underline">
                      {f.name}
                    </Link>
                    {!f.is_active && <span className="ml-2 text-xs text-ink-3">Inactiva</span>}
                  </td>
                  <td className="num px-4 py-3">{ruleText(f)}</td>
                  <td className="num px-4 py-3">
                    {f.transfer_fee_is_estimate ? (
                      <span className="est" title="Valor estimado">{formatUsdText(f.default_transfer_fee)}</span>
                    ) : (
                      formatUsdText(f.default_transfer_fee)
                    )}
                  </td>
                  <td className="num px-4 py-3 text-right">{accountsByFirm.get(f.id) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-3">
          <span className="est">Subrayado punteado</span> = valor estimado, pendiente de confirmar.
        </p>
      </section>

      {catalog.length > 0 && (
        <section aria-labelledby="catalogo">
          <h2 id="catalogo" className="mb-1 font-semibold">
            Catálogo
          </h2>
          <p className="mb-3 text-sm text-ink-2">Empresas conocidas sin reglas todavía. Configura una cuando empieces a usarla.</p>
          <ul className="flex flex-wrap gap-2">
            {catalog.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/empresas/${f.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm hover:border-ink-3"
                >
                  {f.name} <Tag>Configurar</Tag>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
