import type { Metadata } from "next";
import { summarizeFlows, type FlowRow } from "@/domain/flows";
import type { Decimal } from "@/domain/money";
import { requireUser } from "@/lib/auth";
import { formatMoney, formatPct } from "@/lib/format";
import { Q } from "@/lib/queries";

export const metadata: Metadata = { title: "Resumen" };

export default async function DashboardPage() {
  const { supabase } = await requireUser();

  const [{ data: flows, error }, { count: activeAccounts }] = await Promise.all([
    supabase
      .from("cash_flows")
      .select(Q.flowsSummary)
      .returns<FlowRow[]>(),
    supabase.from("accounts").select("id", { count: "exact", head: true }).eq("status", "activa").is("deleted_at", null),
  ]);

  if (error) {
    return <p role="alert" className="text-debit">No se pudieron cargar los movimientos: {error.message}</p>;
  }

  const rows = flows ?? [];
  const usd = summarizeFlows(rows, "usd");
  const clp = summarizeFlows(rows, "clp");

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
            <Stat label="Impuestos pagados" value={formatMoney(usd.T, "usd")} note={`Beneficio neto ${formatMoney(usd.N, "usd")}`} />
            <Stat label="Cuentas activas" value={String(activeAccounts ?? 0)} />
          </dl>
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

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-surface p-4 md:p-5">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="num mt-1 text-xl font-semibold">{value}</dd>
      {note && <dd className="num mt-1 text-xs text-ink-3">{note}</dd>}
    </div>
  );
}
