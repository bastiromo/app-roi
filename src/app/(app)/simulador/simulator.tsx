"use client";

import { useState } from "react";
import { Field } from "@/components/ui";
import { parseDecimalInput } from "@/domain/schemas";
import { APEX_50K, simulate } from "@/domain/simulator";
import { formatMoney, formatPct } from "@/lib/format";

function Slider(props: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; note?: string }) {
  const max = Math.max(props.min, props.max);
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink">{props.label}</span>
        <span className="num text-lg font-semibold">{props.value}</span>
      </span>
      <input
        type="range"
        min={props.min}
        max={max}
        step={1}
        value={Math.min(props.value, max)}
        disabled={max === props.min}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="mt-2 h-8 w-full cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
      />
      <span className="flex justify-between text-xs text-ink-3">
        <span className="num">{props.min}</span>
        {props.note && <span>{props.note}</span>}
        <span className="num">{max}</span>
      </span>
    </label>
  );
}

function Row({ label, value, note, strong, tone }: { label: string; value: string; note?: string; strong?: boolean; tone?: "credit" | "debit" }) {
  const color = tone === "credit" ? "text-credit" : tone === "debit" ? "text-debit" : "text-ink";
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <dt className="text-ink-2">
        {label}
        {note && <span className="block text-xs text-ink-3">{note}</span>}
      </dt>
      <dd className={`num text-right ${strong ? "text-2xl font-semibold tracking-[-0.02em]" : "font-semibold"} ${color}`}>{value}</dd>
    </div>
  );
}

const money = (raw: string, fallback: string) => {
  const v = parseDecimalInput(raw);
  return v && v !== "NaN" && Number(v) >= 0 ? v : fallback;
};

export function Simulator() {
  const [packs, setPacks] = useState(APEX_50K.packs);
  const [approved, setApproved] = useState(APEX_50K.approved);
  const [withdrawing, setWithdrawing] = useState(APEX_50K.withdrawing);
  const [payouts, setPayouts] = useState(APEX_50K.payoutsPerAccount);
  const [packPrice, setPackPrice] = useState(APEX_50K.packPrice);
  const [activation, setActivation] = useState(APEX_50K.activationFee);

  const r = simulate({
    ...APEX_50K,
    packs,
    approved,
    withdrawing,
    payoutsPerAccount: payouts,
    packPrice: money(packPrice, "0"),
    activationFee: money(activation, "0"),
  });
  const win = r.profit.gte(0);
  const ciclos = APEX_50K.payoutTable.slice(0, r.payoutsPerAccount).map((v) => `$${Number(v).toLocaleString("es-CL")}`).join(" + ");

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="rise min-w-0 space-y-6 rounded-3xl border border-line bg-surface p-5 shadow-card md:p-6">
        <h2 className="font-semibold">Calcula tu escenario</h2>
        <Slider label="Packs de 5 evaluaciones" value={packs} min={1} max={10} onChange={setPacks} note={`${r.evaluations} evaluaciones`} />
        <Slider label="Evaluaciones aprobadas" value={r.approved} min={0} max={r.evaluations} onChange={setApproved} note="cada una paga activación" />
        <Slider label="Cuentas que consiguen retirar" value={r.withdrawing} min={0} max={r.approved} onChange={setWithdrawing} />
        <Slider label="Retiros que cobra cada cuenta" value={r.payoutsPerAccount} min={1} max={APEX_50K.payoutTable.length} onChange={setPayouts} note={ciclos} />

        <details className="border-t border-line pt-4 text-sm">
          <summary className="cursor-pointer text-ink-2 hover:text-ink">Cambiar precios</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Precio del pack (USD)" name="packPrice" inputMode="decimal" value={packPrice} onChange={(e) => setPackPrice(e.target.value)} />
            <Field label="Activación por cuenta (USD)" name="activation" inputMode="decimal" value={activation} onChange={(e) => setActivation(e.target.value)} />
          </div>
        </details>
      </section>

      <section className="rise flex flex-col rounded-3xl border border-transparent bg-hero p-5 text-hero-ink shadow-card md:p-6" style={{ animationDelay: "60ms" }} aria-live="polite">
        <h2 className="text-sm text-hero-ink-2">ROI estimado</h2>
        <p className={`num mt-1 text-5xl font-semibold tracking-[-0.04em] ${win ? "" : "text-hero-debit"}`}>{formatPct(r.roiPct)}</p>
        <p className="mt-2 text-sm text-hero-ink-2">
          {r.breakEven === null
            ? ""
            : r.breakEven > r.approved
              ? `Para recuperar la inversión tendrían que cobrar ${r.breakEven} cuentas, y solo aprobaste ${r.approved}.`
              : r.breakEven === 0
                ? ""
                : `Recuperas la inversión si ${r.breakEven === 1 ? "cobra 1 cuenta" : `cobran ${r.breakEven} cuentas`}.`}
        </p>
        <dl className="mt-4 divide-y divide-hero-ink/15 border-t border-hero-ink/15 [&_dd]:text-hero-ink [&_dt]:text-hero-ink-2 [&_dt_span]:text-hero-ink-2">
          <Row label="Packs" note={`${packs} × ${formatMoney(r.packCost.div(Math.max(packs, 1)), "usd")}`} value={formatMoney(r.packCost, "usd")} />
          <Row label="Activaciones" note={`${r.approved} aprobadas`} value={formatMoney(r.activationCost, "usd")} />
          <Row label="Inversión total" value={formatMoney(r.investment, "usd")} />
          <Row label="Retiros brutos" note={`${r.withdrawing} × ${formatMoney(r.perAccount, "usd")}`} value={formatMoney(r.gross, "usd")} />
        </dl>
        <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-hero-ink/15 pt-4">
          <span className="text-hero-ink-2">Beneficio neto</span>
          <span className={`num text-3xl font-semibold tracking-[-0.03em] ${win ? "text-hero-credit" : "text-hero-debit"}`}>{formatMoney(r.profit, "usd")}</span>
        </div>
      </section>

      <p className="text-xs text-ink-3 lg:col-span-2">
        Es una simulación: supone que las cuentas elegidas cobran todos esos retiros. Retiros brutos, sin impuestos ni comisiones de transferencia.
        Precios y montos de retiro de Apex 50K según lo que indicaste; confírmalos con Apex antes de comprar o pedir retiros. No se guarda ni
        afecta tu ROI real.
      </p>
    </div>
  );
}
