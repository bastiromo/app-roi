import type { Metadata } from "next";
import Link from "next/link";
import { CumulativeLine, MonthlyBars, MonthlyTable } from "@/components/monthly-chart";
import { byFirm, type FirmResult, monthlySeries } from "@/domain/dashboard";
import { summarizeFlows, type FlowRow } from "@/domain/flows";
import { d, type Decimal } from "@/domain/money";
import { requireUser } from "@/lib/auth";
import { formatMoney, formatPct } from "@/lib/format";
import { Q } from "@/lib/queries";
import { listPayouts } from "./payouts/data";

export const metadata: Metadata = { title: "Resumen" };

export default async function DashboardPage() {
  const { supabase } = await requireUser();

  const [{ data: flows, error }, { count: activeAccounts }, { data: firms }, payouts] = await Promise.all([
    supabase
      .from("cash_flows")
      .select(Q.flowsSummary)
      .returns<(FlowRow & { flow_date: string })[]>(),
    supabase.from("accounts").select("id", { count: "exact", head: true }).eq("status", "activa").is("deleted_at", null),
    supabase.from("firms").select("id,name").returns<{ id: string; name: string }[]>(),
    listPayouts(),
  ]);

  if (error) {
    return <p role="alert" className="text-debit">No se pudieron cargar los movimientos: {error.message}</p>;
  }

  const rows = flows ?? [];
  const usd = summarizeFlows(rows, "usd");
  const clp = summarizeFlows(rows, "clp");

  // Por cobrar: payouts solicitados/aprobados, o pagados sin monto recibido (tu parte, antes de comisiones)
  const pendingByFirm = new Map<string, Decimal>();
  for (const p of payouts) {
    const waiting = !p.received && (p.status === "requested" || p.status === "approved" || p.status === "paid");
    if (!waiting) continue;
    const share = d(p.requested_amount).mul(d(p.trader_share_pct)).div(100);
    pendingByFirm.set(p.firm_id, (pendingByFirm.get(p.firm_id) ?? d(0)).add(share));
  }
  const pending = [...pendingByFirm.values()].reduce((t, v) => t.add(v), d(0));
  const perFirm = byFirm(rows, firms ?? [], pendingByFirm);
  const months = monthlySeries(rows).map((m) => ({
    month: m.month,
    costs: Number(m.costs.toFixed(2)),
    received: Number(m.received.toFixed(2)),
    net: Number(m.net.toFixed(2)),
    cumulative: Number(m.cumulative.toFixed(2)),
  }));

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Resumen</h1>
        <p className="mt-1 text-sm text-ink-2">Todo lo que has pagado y recibido, en todas las empresas.</p>
      </header>

      {rows.length === 0 ? (
        <section className="rounded-xl border border-dashed border-line bg-surface p-6 md:p-8">
          <h2 className="font-semibold">Aún no hay movimientos</h2>
          <p className="mt-2 max-w-prose text-sm text-ink-2">
            Cuando registres gastos y payouts, aquí verás cuánto recuperaste y tu ROI real. El siguiente paso es cargar tu
            historial de Lucid.
          </p>
        </section>
      ) : (
        <>
          <Equation received={usd.R} estimated={usd.REstimated} costs={usd.C} profit={usd.B} roi={usd.roiPrePct} />
          <dl className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="ROI en pesos" value={formatPct(clp.roiPrePct)} note={`Beneficio ${formatMoney(clp.B, "clp")}`} />
            <Stat label="Capital recuperado" value={formatPct(usd.recoveryPct)} note="Recibido sobre costos" />
            <Stat
              label="Por cobrar"
              value={formatMoney(pending, "usd")}
              note={pending.isZero() ? "Sin payouts pendientes" : "Solicitados o sin monto recibido"}
            />
            <Stat
              label="Cuentas activas"
              value={String(activeAccounts ?? 0)}
              note={usd.T.isZero() ? undefined : `Impuestos pagados ${formatMoney(usd.T, "usd")}`}
            />
          </dl>

          <FirmTable rows={perFirm} />

          {months.length > 0 && (
            <section aria-labelledby="evolucion" className="space-y-6 rounded-xl border border-line bg-surface p-5 md:p-8">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 id="evolucion" className="font-semibold">
                    Mes a mes
                  </h2>
                  <p className="text-sm text-ink-2">Costos pagados y dinero recibido en cada mes, en USD.</p>
                </div>
                <ul className="flex gap-4 text-sm text-ink-2" aria-label="Leyenda">
                  <li className="flex items-center gap-2">
                    <span className="inline-block size-3 rounded-sm bg-series-cost" /> Costos
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="inline-block size-3 rounded-sm bg-series-received" /> Recibido
                  </li>
                </ul>
              </div>
              <MonthlyBars data={months} />
              <div>
                <h3 className="font-semibold">Beneficio acumulado</h3>
                <p className="text-sm text-ink-2">Sobre la línea del cero ya recuperaste todo lo invertido.</p>
              </div>
              <CumulativeLine data={months} />
              <MonthlyTable data={months} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** La pieza central: la ecuación del libro mayor, leída de izquierda a derecha. */
function Equation(props: { received: Decimal; estimated: Decimal; costs: Decimal; profit: Decimal; roi: Decimal | null }) {
  const hasEstimate = !props.estimated.isZero();
  return (
    <section aria-label="Resultado acumulado" className="rounded-xl border border-line bg-surface p-5 md:p-8">
      <div className="grid gap-5 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-end md:gap-6">
        <Term label="Recibido" value={formatMoney(props.received, "usd")} tone="credit" estimated={hasEstimate} />
        <Op>−</Op>
        <Term label="Costos" value={formatMoney(props.costs, "usd")} tone="debit" />
        <Op>=</Op>
        <Term label="Beneficio" value={formatMoney(props.profit, "usd")} tone="ink" strong />
      </div>
      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-3 border-t border-line pt-5">
        <p className="text-sm text-ink-2">
          ROI antes de impuestos{" "}
          <span className="num ml-2 text-3xl font-semibold tracking-tight text-ink md:text-4xl">{formatPct(props.roi)}</span>
        </p>
        {hasEstimate && (
          <p className="text-sm text-ink-2">
            Incluye <span className="num est">{formatMoney(props.estimated, "usd")}</span> estimados con la regla de cada empresa
          </p>
        )}
      </div>
    </section>
  );
}

function Term(props: { label: string; value: string; tone: "credit" | "debit" | "ink"; strong?: boolean; estimated?: boolean }) {
  const color = { credit: "text-credit", debit: "text-debit", ink: "text-ink" }[props.tone];
  return (
    <div>
      <p className="text-sm text-ink-2">{props.label}</p>
      <p className={`num mt-1 text-2xl md:text-[1.75rem] ${props.strong ? "font-semibold" : "font-medium"} ${color}`}>
        {props.value}
        {props.estimated && <span className="ml-1 align-super text-xs text-estimate" title="Incluye montos estimados">*</span>}
      </p>
    </div>
  );
}

function Op({ children }: { children: React.ReactNode }) {
  return <span aria-hidden="true" className="hidden pb-1 text-2xl font-light text-ink-3 md:block">{children}</span>;
}

function FirmTable({ rows }: { rows: FirmResult[] }) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="por-empresa">
      <h2 id="por-empresa" className="mb-3 font-semibold">
        Por empresa
      </h2>
      {/* Celular: una tarjeta por empresa, todos los números visibles */}
      <ul className="space-y-3 md:hidden">
        {rows.map((f) => (
          <li key={f.firmId ?? "general"} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between gap-3">
              {f.firmId ? (
                <Link href={`/gastos?empresa=${f.firmId}`} className="font-semibold text-ink">
                  {f.name}
                </Link>
              ) : (
                <span className="font-semibold text-ink-2">{f.name}</span>
              )}
              <span className="num text-lg font-semibold">{formatPct(f.roiPct)}</span>
            </div>
            <dl className="num mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-ink-2">Costos</dt>
              <dd className="text-right">{formatMoney(f.costs, "usd")}</dd>
              <dt className="text-ink-2">Recibido</dt>
              <dd className={`text-right ${f.receivedEstimated.isZero() ? "" : "est"}`}>{formatMoney(f.received, "usd")}</dd>
              <dt className="text-ink-2">Beneficio</dt>
              <dd className={`text-right font-semibold ${f.profit.isNegative() ? "text-debit" : "text-ink"}`}>{formatMoney(f.profit, "usd")}</dd>
              {!f.pending.isZero() && (
                <>
                  <dt className="text-ink-2">Por cobrar</dt>
                  <dd className="text-right text-ink-2">{formatMoney(f.pending, "usd")}</dd>
                </>
              )}
            </dl>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface md:block">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="text-left text-ink-2">
            <tr className="border-b border-line">
              <th className="px-4 py-3 font-medium">Empresa</th>
              <th className="px-4 py-3 text-right font-medium">Costos</th>
              <th className="px-4 py-3 text-right font-medium">Recibido</th>
              <th className="px-4 py-3 text-right font-medium">Beneficio</th>
              <th className="px-4 py-3 text-right font-medium">ROI</th>
              <th className="px-4 py-3 text-right font-medium">Por cobrar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.firmId ?? "general"} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  {f.firmId ? (
                    <Link href={`/gastos?empresa=${f.firmId}`} className="font-medium text-ink hover:underline">
                      {f.name}
                    </Link>
                  ) : (
                    <span className="text-ink-2">{f.name}</span>
                  )}
                </td>
                <td className="num px-4 py-3 text-right">{formatMoney(f.costs, "usd")}</td>
                <td className="num px-4 py-3 text-right">
                  {f.receivedEstimated.isZero() ? (
                    formatMoney(f.received, "usd")
                  ) : (
                    <span className={f.receivedEstimated.eq(f.received) ? "est" : ""} title={`${formatMoney(f.receivedEstimated, "usd")} estimado`}>
                      {formatMoney(f.received, "usd")}
                      {!f.receivedEstimated.eq(f.received) && <span className="ml-0.5 text-xs text-estimate">*</span>}
                    </span>
                  )}
                </td>
                <td className={`num px-4 py-3 text-right font-semibold ${f.profit.isNegative() ? "text-debit" : "text-ink"}`}>
                  {formatMoney(f.profit, "usd")}
                </td>
                <td className="num px-4 py-3 text-right">{formatPct(f.roiPct)}</td>
                <td className="num px-4 py-3 text-right text-ink-2">{f.pending.isZero() ? "—" : formatMoney(f.pending, "usd")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-3">
        Sin impuestos. Los costos sin empresa (plataformas, datos) solo cuentan en el total.{" "}
        <span className="est">Punteado</span> o * = incluye recibido estimado.
      </p>
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-surface p-4 md:p-5">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="num mt-1 text-xl font-semibold">{value}</dd>
      {note && <dd className="num mt-1 text-xs text-ink-3">{note}</dd>}
    </div>
  );
}
