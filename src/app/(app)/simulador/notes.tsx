import type { ReactNode } from "react";
import type { Decimal } from "@/domain/money";
import { planToPayout, type PlanResult } from "@/domain/simulator";
import { formatMoney } from "@/lib/format";

// Notas del usuario: plan Apex 50K Intraday hasta el primer retiro. Las tablas se calculan (no son texto fijo).
const RULES = { start: "50000", withdrawal: "1500", safetyNet: "52100" };
const A = planToPayout({ ...RULES, results: ["1500", "1500", "200", "200", "200"] });
const B = planToPayout({ ...RULES, results: ["1500", "-1000", "1800", "450", "450", "450"] });

const usd0 = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const bal = (v: Decimal) => usd0.format(v.toNumber());
const signed = (v: Decimal) => `${v.isNegative() ? "−" : "+"}US$${usd0.format(v.abs().toNumber())}`;
const pct = (v: Decimal | null) => (v ? `${v.toFixed(2).replace(".", ",")} %` : "—");

function Check({ ok = true }: { ok?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className={`mt-0.5 shrink-0 ${ok ? "text-credit" : "text-debit"}`}>
      <path d={ok ? "M3 8.5l3.2 3L13 4.5" : "M4 4l8 8M12 4l-8 8"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1.5 text-sm text-ink-2">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2">
          <Check />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Card({ step, title, children }: { step?: string; title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-5 shadow-card md:p-6">
      <h3 className="font-semibold">
        {step && <span className="mr-2 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-2">{step}</span>}
        {title}
      </h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Scenario({ name, title, plan }: { name: string; title: string; plan: PlanResult }) {
  const extra = plan.balanceAfter.sub(RULES.safetyNet);
  return (
    <section className="flex flex-col rounded-3xl border border-line bg-surface p-5 shadow-card md:p-6">
      <h3 className="font-semibold">
        <span className="mr-2 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-ink">{name}</span>
        {title}
      </h3>
      <table className="num mt-4 w-full text-sm">
        <thead className="text-left text-ink-2">
          <tr className="border-b border-line">
            <th className="py-2 font-medium">Día</th>
            <th className="py-2 text-right font-medium">Resultado</th>
            <th className="py-2 text-right font-medium">Balance</th>
          </tr>
        </thead>
        <tbody>
          {plan.days.map((x) => (
            <tr key={x.day} className="border-b border-line last:border-0">
              <td className="py-1.5">
                {x.day}
                {!x.valid && <span className="ml-2 text-xs text-ink-3">no cuenta</span>}
              </td>
              <td className={`py-1.5 text-right font-medium ${x.result.isNegative() ? "text-debit" : "text-credit"}`}>{signed(x.result)}</td>
              <td className="py-1.5 text-right">{bal(x.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="num mt-4 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 border-t border-line pt-4 text-sm">
        <dt className="text-ink-2">Balance final</dt>
        <dd className="text-right font-semibold">{formatMoney(plan.finalBalance, "usd")}</dd>
        <dt className="text-ink-2">Ganancia neta</dt>
        <dd className="text-right font-semibold">{formatMoney(plan.net, "usd")}</dd>
        <dt className="text-ink-2">Mejor día</dt>
        <dd className="flex items-start justify-end gap-1.5 text-right font-semibold">
          {formatMoney(plan.bestDay, "usd")} = {pct(plan.consistencyPct)} <Check ok={plan.consistencyOk} />
        </dd>
        <dt className="text-ink-2">Días válidos</dt>
        <dd className="flex items-start justify-end gap-1.5 text-right font-semibold">
          {plan.validDays} <Check ok={plan.daysOk} />
        </dd>
      </dl>
      <p className="mt-4 rounded-2xl bg-credit-bg px-4 py-3 text-sm text-credit">
        <strong className="num block text-base">Retiro: {formatMoney(plan.balanceAfter.sub(plan.finalBalance).neg(), "usd")}</strong>
        <span className="num">
          Balance posterior: {formatMoney(plan.balanceAfter, "usd")} (
          {extra.isZero() ? "igual al Safety Net" : `${formatMoney(extra, "usd")} sobre el Safety Net`})
        </span>
      </p>
    </section>
  );
}

const DLL: [string, string, string][] = [
  ["1", "US$0 – US$1.499", "US$1.000"],
  ["2", "US$1.500 – US$2.999", "US$1.000"],
  ["3", "US$3.000 – US$5.999", "US$2.000"],
  ["4", "US$6.000 o más", "US$3.000"],
];

export function ApexNotes() {
  return (
    <details open className="group space-y-4">
      <summary className="flex cursor-pointer list-none items-end justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-xl font-semibold tracking-tight">Notas: Apex 50K Intraday</span>
          <span className="block text-sm text-ink-2">Plan para llegar al primer retiro de US$1.500, con dos escenarios.</span>
        </span>
        <span className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink-2">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="-rotate-90 transition-transform group-open:rotate-0">
            <path d="M6 9l6 6 6-6" />
          </svg>
          <span className="group-open:hidden">Mostrar</span>
          <span className="hidden group-open:inline">Ocultar</span>
        </span>
      </summary>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card step="Etapa 1" title="Evaluación">
          <dl className="num mb-4 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-ink-2">Cuenta inicial</dt>
            <dd className="text-right font-semibold">US$50.000</dd>
            <dt className="text-ink-2">Objetivo de ganancia</dt>
            <dd className="text-right font-semibold text-credit">+US$3.000</dd>
            <dt className="text-ink-2">Trailing drawdown máximo</dt>
            <dd className="text-right font-semibold">US$2.000</dd>
          </dl>
          <List items={["Intraday sin Daily Loss Limit (DLL)", "Se puede aprobar en un día", "Sin regla de consistencia", "Hasta 6 minis / 60 micros"]} />
        </Card>

        <Card step="Etapa 2" title="PA: colchón y retiro">
          <List
            items={[
              <>Mínimo 5 días de trading con al menos <strong className="text-ink">US$200</strong> netos de beneficio cada uno</>,
              <>Consistencia estrictamente menor al <strong className="text-ink">50 %</strong> (mejor día / ganancia neta)</>,
              <>Balance mínimo para solicitar: <strong className="num text-ink">US$52.600</strong></>,
              <>Conservar el Safety Net de <strong className="num text-ink">US$52.100</strong> después del retiro</>,
              <>Primer retiro máximo: <strong className="num text-ink">US$1.500</strong></>,
            ]}
          />
        </Card>

        <Scenario name="A" title="Si los dos primeros días salen bien" plan={A} />
        <Scenario name="B" title="Si el segundo día se pierde" plan={B} />

        <section className="rounded-3xl border border-line bg-surface p-5 shadow-card md:p-6 lg:col-span-2">
          <h3 className="font-semibold">Importante: DLL en la PA 50K</h3>
          <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <table className="num w-full text-sm">
              <thead className="text-left text-ink-2">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-medium">Nivel</th>
                  <th className="py-2 pr-3 font-medium">Beneficio acumulado</th>
                  <th className="py-2 text-right font-medium">DLL (siguiente sesión)</th>
                </tr>
              </thead>
              <tbody>
                {DLL.map(([n, range, dll]) => (
                  <tr key={n} className="border-b border-line last:border-0">
                    <td className="py-1.5">{n}</td>
                    <td className="py-1.5">{range}</td>
                    <td className="py-1.5 text-right font-semibold">{dll}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
              <li>El nivel se calcula según el balance de cierre del día y aplica a la siguiente sesión.</li>
              <li>Escenario A: al cerrar el día 2 con US$53.000, el DLL de US$2.000 aplica desde la siguiente sesión.</li>
              <li>Escenario B: al cerrar el día 5 por encima de US$53.000, el DLL de US$2.000 aplica desde la sesión siguiente.</li>
            </ul>
          </div>
          <p role="note" className="mt-5 rounded-2xl bg-debit-bg px-4 py-3 text-sm font-medium text-debit">
            El DLL limita la pérdida de una sesión y pausa la operativa ese día; tocar el trailing drawdown puede cerrar la PA. Son reglas distintas.
          </p>
        </section>
      </div>
      <p className="text-xs text-ink-3">
        Simulación matemática, no garantía de aprobación ni de pago. Respetar el trailing drawdown intradía, las pérdidas flotantes y las reglas
        vigentes de Apex y de la plataforma.
      </p>
    </details>
  );
}
