import Link from "next/link";
import type { ReactNode } from "react";
import { type ChartPoint, FlowChart, Sparkline } from "@/components/dash-charts";
import { Delta, Segmented } from "@/components/ui";
import { byFirm, type FirmResult } from "@/domain/dashboard";
import { type FlowRow, summarizeFlows } from "@/domain/flows";
import { d, type Decimal } from "@/domain/money";
import { bucketSeries, inWindow, type Period, PERIOD_LABEL, PERIODS, pctChange, periodWindow } from "@/domain/periods";
import { formatDate, formatMoney, formatPct } from "@/lib/format";

const pctFmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });
const n2 = (v: Decimal) => Number(v.toFixed(2));

/** Chip de variación porcentual frente al período anterior. */
function pctDelta(cur: Decimal, prev: Decimal | null, good = true, onHero = false) {
  if (prev === null) return null;
  const ch = pctChange(cur, prev);
  if (ch === null || ch.isZero()) return null;
  return <Delta text={`${pctFmt.format(Math.abs(n2(ch)))} %`} up={ch.gt(0)} good={good} onHero={onHero} />;
}

export interface PendingPayout {
  firm_id: string;
  status: string;
  received: unknown;
  requested_amount: string;
  trader_share_pct: string;
}

/** Dibuja el Resumen a partir de los datos (sin consultar la base: se puede previsualizar con datos de ejemplo). */
export function DashboardView(props: {
  rows: (FlowRow & { flow_date: string })[];
  firms: { id: string; name: string }[];
  payouts: PendingPayout[];
  activeAccounts: number;
  nowIso: string;
  period: Period;
}) {
  const { firms, payouts, activeAccounts, period } = props;
  const rows = props.rows;
  // "Hoy" en Chile, decidido por la base (no por el render)
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date(props.nowIso));
  const first = rows.reduce<string | null>((m, r) => (m === null || r.flow_date < m ? r.flow_date : m), null);
  const w = periodWindow(period, today, first);
  const cur = period === "todo" ? rows : inWindow(rows, w.from, w.to);
  const prev = w.prevFrom && w.prevTo ? inWindow(rows, w.prevFrom, w.prevTo) : null;

  const usd = summarizeFlows(cur, "usd");
  const clp = summarizeFlows(cur, "clp");
  const before = prev ? summarizeFlows(prev, "usd") : null;
  const points = bucketSeries(rows, w);
  const starts = points.map((p) => p.start);

  // Por cobrar: payouts solicitados/aprobados, o pagados sin monto recibido (tu parte, antes de comisiones)
  const pendingByFirm = new Map<string, Decimal>();
  for (const p of payouts) {
    const waiting = !p.received && (p.status === "requested" || p.status === "approved" || p.status === "paid");
    if (!waiting) continue;
    const share = d(p.requested_amount).mul(d(p.trader_share_pct)).div(100);
    pendingByFirm.set(p.firm_id, (pendingByFirm.get(p.firm_id) ?? d(0)).add(share));
  }
  const pending = [...pendingByFirm.values()].reduce((t, v) => t.add(v), d(0));
  const perFirm = byFirm(cur, firms ?? [], pendingByFirm);

  const hasEstimate = !usd.REstimated.isZero();
  const confirmed = usd.R.sub(usd.REstimated);
  const roiDelta =
    before && usd.roiPrePct && before.roiPrePct && !usd.roiPrePct.eq(before.roiPrePct) ? usd.roiPrePct.sub(before.roiPrePct) : null;

  const chart: ChartPoint[] = points.map((p) => ({
    start: p.start,
    end: p.end,
    costs: n2(p.costs),
    received: n2(p.received),
    estimated: n2(p.receivedEstimated),
    net: n2(p.net),
    cumulative: n2(p.cumulative),
  }));
  const periodText = period === "todo" ? (first ? `Desde ${formatDate(w.from)}` : "Sin movimientos") : `${formatDate(w.from)} – hoy`;
  const prevText = period === "todo" ? "" : "vs período anterior";

  return (
    <div className="space-y-6">
      <header className="rise flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl font-semibold tracking-[-0.04em] md:text-5xl">Resumen</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/cuentas?estado=activa"
            aria-label={`Ver ${activeAccounts ?? 0} ${activeAccounts === 1 ? "cuenta activa" : "cuentas activas"}`}
            className="group inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm shadow-card transition-colors hover:border-ink-3 active:scale-[0.98]"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-credit opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-credit" />
            </span>
            <span className="num font-semibold">{activeAccounts ?? 0}</span>
            <span className="text-ink-2">{activeAccounts === 1 ? "cuenta activa" : "cuentas activas"}</span>
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="-mr-1 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
          <Link
            href="/exportar"
            className="hidden h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90 sm:inline-flex"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14" />
            </svg>
            Exportar
          </Link>
        </div>
      </header>

      {rows.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-line bg-surface p-6 md:p-8">
          <h2 className="font-semibold">Aún no hay movimientos</h2>
          <p className="mt-2 max-w-prose text-sm text-ink-2">
            Cuando registres gastos y payouts, aquí verás cuánto recuperaste y tu ROI real. El siguiente paso es cargar tu historial.
          </p>
        </section>
      ) : (
        <>
          <div className="rise flex flex-wrap items-center gap-3" style={{ animationDelay: "40ms" }}>
            <Segmented
              label="Período"
              items={PERIODS.map((p) => ({ href: p === "todo" ? "/" : `/?periodo=${p}`, label: PERIOD_LABEL[p], active: p === period }))}
            />
            <span className="inline-flex items-center gap-1.5 text-sm text-ink-2">
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7.5V12l3 2" />
              </svg>
              {periodText}
            </span>
          </div>

          {/* Indicadores */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              hero
              delay={80}
              label="Beneficio"
              value={formatMoney(usd.B, "usd")}
              delta={pctDelta(usd.B, before?.B ?? null, true, true)}
              compare={prevText}
              spark={<Sparkline onHero what="Acumulado" values={points.map((p) => n2(p.cumulative))} starts={starts} bucket={w.bucket} label="Beneficio acumulado" />}
              foot={
                <span>
                  Recibido − costos{hasEstimate && <span className="text-hero-ink-2"> · incluye estimados</span>}
                </span>
              }
            />
            <Kpi
              delay={130}
              label={
                <>
                  ROI antes de impuestos{hasEstimate && <span className="text-estimate"> · estimado</span>}
                </>
              }
              value={formatPct(usd.roiPrePct)}
              delta={
                roiDelta && (
                  <Delta text={`${pctFmt.format(Math.abs(n2(roiDelta)))} pt`} up={roiDelta.gt(0)} />
                )
              }
              compare={prevText}
              spark={
                <Sparkline values={points.map((p) => (p.cumulativeRoiPct ? n2(p.cumulativeRoiPct) : null))} starts={starts} bucket={w.bucket} unit="pct" what="Acumulado" label="ROI acumulado" />
              }
              foot={<Link href="/empresas" className="underline-offset-4 hover:underline">Ver empresas</Link>}
            />
            <Kpi
              delay={180}
              label="Recibido"
              value={formatMoney(usd.R, "usd")}
              estimated={hasEstimate}
              delta={pctDelta(usd.R, before?.R ?? null)}
              compare={prevText}
              spark={<Sparkline kind="bars" values={points.map((p) => n2(p.received))} starts={starts} bucket={w.bucket} label="Recibido por tramo" />}
              foot={<Link href="/payouts" className="underline-offset-4 hover:underline">Ver payouts</Link>}
            />
            <Kpi
              delay={230}
              label="Costos"
              value={formatMoney(usd.C, "usd")}
              delta={pctDelta(usd.C, before?.C ?? null, false)}
              compare={prevText}
              spark={<Sparkline kind="bars" values={points.map((p) => n2(p.costs))} starts={starts} bucket={w.bucket} label="Costos por tramo" />}
              foot={<Link href="/gastos" className="underline-offset-4 hover:underline">Ver gastos</Link>}
            />
          </div>

          <div className="rise space-y-1 text-xs text-ink-3" style={{ animationDelay: "260ms" }}>
            {hasEstimate && (
              <p>
                Incluye <span className="num est">{formatMoney(usd.REstimated, "usd")}</span> estimados con la regla de cada empresa.{" "}
                {confirmed.isZero()
                  ? "Aún no registras montos reales: cuando sepas cuánto llegó en un payout, regístralo como monto real."
                  : `Solo con montos reales: recibido ${formatMoney(confirmed, "usd")}, beneficio ${formatMoney(confirmed.sub(usd.C), "usd")}.`}
              </p>
            )}
            {period !== "todo" && (
              <p>
                Flujos de estas fechas. Los payouts suelen venir de cuentas compradas antes, así que el ROI de un período puede
                exagerar o castigar; la referencia es <Link href="/" className="underline">Todo</Link>.
              </p>
            )}
          </div>

          {/* Secundarios */}
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MiniStat delay={290} label="ROI en pesos" value={formatPct(clp.roiPrePct)} note={`Beneficio ${formatMoney(clp.B, "clp")}`} />
            <MiniStat delay={320} label="Capital recuperado" value={formatPct(usd.recoveryPct)} note="Recibido sobre costos" />
            <MiniStat
              delay={350}
              label="Por cobrar"
              value={formatMoney(pending, "usd")}
              note={pending.isZero() ? "Sin payouts pendientes" : "Solicitados o sin monto recibido"}
            />
          </dl>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <section className="rise min-w-0 rounded-3xl border border-line bg-surface p-5 shadow-card md:p-6" style={{ animationDelay: "380ms" }}>
              <FlowChart
                data={chart}
                bucket={w.bucket}
                headline={formatMoney(usd.B, "usd")}
                headlineNote={`Beneficio ${period === "todo" ? "total" : "del período"}, ${w.bucket === "day" ? "por día" : w.bucket === "week" ? "por semana" : "por mes"}, en USD`}
                delta={pctDelta(usd.B, before?.B ?? null)}
              />
            </section>
            <FirmCard rows={perFirm} total={usd.R} />
          </div>
          {!usd.T.isZero() && <p className="text-xs text-ink-3">Impuestos pagados en el período: {formatMoney(usd.T, "usd")}.</p>}
        </>
      )}
    </div>
  );
}

function Kpi(props: {
  label: ReactNode;
  value: string;
  delta?: ReactNode;
  compare: string;
  spark: ReactNode;
  foot: ReactNode;
  hero?: boolean;
  estimated?: boolean;
  delay: number;
}) {
  const base = props.hero ? "bg-hero text-hero-ink border-transparent" : "bg-surface border-line";
  const muted = props.hero ? "text-hero-ink-2" : "text-ink-2";
  return (
    <section className={`rise lift flex flex-col rounded-3xl border p-5 shadow-card ${base}`} style={{ animationDelay: `${props.delay}ms` }}>
      <h2 className={`text-sm ${muted}`}>{props.label}</h2>
      <p className="num mt-1.5 text-[2rem] font-semibold leading-tight tracking-[-0.03em]">
        {props.value}
        {props.estimated && (
          <span className="ml-1 align-super text-sm text-estimate" title="Incluye montos estimados">
            *
          </span>
        )}
      </p>
      <div className="mt-1.5 flex h-6 items-center gap-2 text-xs">
        {props.delta}
        {props.delta && <span className={muted}>{props.compare}</span>}
      </div>
      <div className="mt-3">{props.spark}</div>
      <div className={`mt-4 border-t pt-3 text-sm ${props.hero ? "border-hero-ink/15 text-hero-ink-2" : "border-line text-ink-2"}`}>{props.foot}</div>
    </section>
  );
}

function MiniStat({ label, value, note, delay }: { label: string; value: string; note: string; delay: number }) {
  return (
    <div className="rise rounded-3xl border border-line bg-surface px-5 py-4 shadow-card" style={{ animationDelay: `${delay}ms` }}>
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="num mt-0.5 text-xl font-semibold tracking-[-0.02em]">{value}</dd>
      <dd className="mt-0.5 text-xs text-ink-3">{note}</dd>
    </div>
  );
}

/** Tono por posición: la empresa con más recibido en tinta plena, las demás más claras. */
const SHARE_OPACITY = [1, 0.62, 0.38, 0.22, 0.14];

function FirmCard({ rows, total }: { rows: FirmResult[]; total: Decimal }) {
  const firms = rows.filter((f) => f.firmId);
  const general = rows.find((f) => !f.firmId);
  const withReceived = [...firms].filter((f) => f.received.gt(0)).sort((a, b) => b.received.comparedTo(a.received));
  const opacity = new Map(withReceived.map((f, i) => [f.firmId, SHARE_OPACITY[Math.min(i, SHARE_OPACITY.length - 1)]]));
  const share = (f: FirmResult) => (total.isZero() ? 0 : n2(f.received.div(total).mul(100)));

  return (
    <section aria-labelledby="por-empresa" className="rise flex flex-col rounded-3xl border border-line bg-surface p-5 shadow-card md:p-6" style={{ animationDelay: "430ms" }}>
      <h2 id="por-empresa" className="text-sm font-medium text-ink-2">
        Por empresa
      </h2>
      {withReceived.length > 0 && (
        <>
          <div className="mt-3 flex items-baseline justify-between gap-3">
            <p>
              <span className="num text-2xl font-semibold tracking-[-0.03em]">{pctFmt.format(share(withReceived[0]))} %</span>{" "}
              <span className="text-sm text-ink-2">{withReceived[0].name}</span>
            </p>
            {withReceived[1] && (
              <p className="text-right">
                <span className="num text-2xl font-semibold tracking-[-0.03em]">{pctFmt.format(share(withReceived[1]))} %</span>{" "}
                <span className="text-sm text-ink-2">{withReceived[1].name}</span>
              </p>
            )}
          </div>
          <div className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Parte de lo recibido por empresa">
            {withReceived.map((f) => (
              <span key={f.firmId} className="h-full bg-series-received first:rounded-l-full last:rounded-r-full" style={{ width: `${share(f)}%`, opacity: opacity.get(f.firmId) }} />
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-3">Parte de lo recibido</p>
        </>
      )}

      <ul className="mt-4 divide-y divide-line">
        {firms.map((f) => (
          <li key={f.firmId} className="flex items-start justify-between gap-3 py-3">
            <div className="flex min-w-0 gap-2.5">
              <span
                aria-hidden="true"
                className="mt-1.5 inline-block size-2.5 shrink-0 rounded-sm bg-series-received"
                style={{ opacity: opacity.get(f.firmId) ?? 0.1 }}
              />
              <div className="min-w-0">
                <Link href={`/gastos?empresa=${f.firmId}`} className="font-medium text-ink hover:underline">
                  {f.name}
                </Link>
                <p className="num text-xs text-ink-3">
                  Invertido {formatMoney(f.costs, "usd")} · recibido{" "}
                  <span className={f.receivedEstimated.isZero() ? "" : "est"}>{formatMoney(f.received, "usd")}</span>
                  {!f.pending.isZero() && <> · por cobrar {formatMoney(f.pending, "usd")}</>}
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className={`num font-semibold ${f.profit.isNegative() ? "text-debit" : "text-ink"}`}>{formatMoney(f.profit, "usd")}</p>
              {f.roiPct && (
                <span
                  className={`num mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${f.roiPct.isNegative() ? "bg-debit-bg text-debit" : "bg-credit-bg text-credit"}`}
                >
                  ROI {formatPct(f.roiPct)}
                </span>
              )}
            </div>
          </li>
        ))}
        {general && !general.costs.isZero() && (
          <li className="flex items-start justify-between gap-3 py-3 text-sm">
            <div>
              <p className="text-ink-2">Costos generales</p>
              <p className="text-xs text-ink-3">Plataformas y datos, sin empresa</p>
            </div>
            <p className="num font-semibold text-debit">{formatMoney(general.costs.neg(), "usd")}</p>
          </li>
        )}
      </ul>
      {firms.length === 0 && <p className="mt-3 text-sm text-ink-2">Sin movimientos en este período.</p>}
      <p className="mt-auto pt-3 text-xs text-ink-3">Beneficio por empresa, sin impuestos.</p>
    </section>
  );
}
