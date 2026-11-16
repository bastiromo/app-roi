"use client";

import { useState } from "react";
import { Field } from "@/components/ui";
import { consistencyPlan } from "@/domain/consistency";
import type { Decimal } from "@/domain/money";
import { parseDecimalInput } from "@/domain/schemas";
import { formatMoney } from "@/lib/format";

const num = (raw: string, fallback: string, allowNegative = false) => {
  const v = parseDecimalInput(raw.replace("−", "-"));
  return v && v !== "NaN" && (allowNegative || Number(v) >= 0) ? v : fallback;
};
const pct = (v: Decimal | null) => (v ? `${v.toFixed(1).replace(".", ",")} %` : "—");
const chip = (active: boolean) =>
  `rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${active ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink"}`;

const APEX_TARGETS: [string, string][] = [
  ["Ciclo 1", "3600"],
  ["Ciclo 2", "2000"],
  ["Ciclos 3 y 4", "2500"],
  ["Ciclos 5 y 6", "3000"],
];

export function ConsistencyCalculator() {
  const [limit, setLimit] = useState("50");
  const [strict, setStrict] = useState(true);
  const [target, setTarget] = useState("2000");
  const [minDays, setMinDays] = useState("5");
  const [minDay, setMinDay] = useState("200");
  const [days, setDays] = useState<string[]>([]);

  const limitPct = (() => {
    const v = Number(num(limit, "50"));
    return v >= 1 && v <= 100 ? String(v) : "50";
  })();
  const entered = days.map((v) => num(v, "", true)).filter((v) => v !== "");
  const r = consistencyPlan({
    limitPct,
    strict,
    target: num(target, "0"),
    minDays: Math.min(60, Math.trunc(Number(num(minDays, "0")))),
    minDay: num(minDay, "0"),
    days: entered,
  });
  const lim = `${limitPct} %`;
  const setDay = (i: number, v: string) => setDays((p) => p.map((x, j) => (j === i ? v : x)));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 space-y-4">
        <section className="rise space-y-5 rounded-3xl border border-line bg-surface p-5 shadow-card md:p-6">
          <h2 className="font-semibold">Regla de la empresa</h2>
          <div>
            <p className="mb-2 text-sm text-ink-2">Límite de consistencia: el mejor día no puede pasar de este % de la ganancia del ciclo</p>
            <div className="flex flex-wrap items-center gap-3">
              <div role="radiogroup" aria-label="Límite de consistencia" className="inline-flex rounded-full bg-surface-2 p-1 shadow-[inset_0_0_0_1px_var(--line)]">
                {["50", "40", "30"].map((v) => (
                  <button key={v} role="radio" aria-checked={limit === v} onClick={() => setLimit(v)} className={chip(limit === v)}>
                    {v} %
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm text-ink-2">
                Otro
                <input
                  inputMode="decimal"
                  aria-label="Otro límite en porcentaje"
                  value={["50", "40", "30"].includes(limit) ? "" : limit}
                  onChange={(e) => setLimit(e.target.value)}
                  placeholder="%"
                  className="h-10 w-20 rounded-xl border border-line bg-surface px-3 text-ink"
                />
              </label>
            </div>
            <label className="mt-3 flex items-start gap-2 text-sm text-ink-2">
              <input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
              <span>
                Debe ser <strong className="text-ink">menor</strong> al {lim} (como Apex). Desmárcalo si en tu empresa el {lim} exacto también vale.
              </span>
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Días rentables mínimos" name="minDays" inputMode="numeric" value={minDays} onChange={(e) => setMinDays(e.target.value)} hint="Pon 0 si no te exigen días." />
            <Field label="Mínimo para que un día cuente (USD)" name="minDay" inputMode="decimal" value={minDay} onChange={(e) => setMinDay(e.target.value)} />
          </div>
        </section>

        <section className="rise space-y-4 rounded-3xl border border-line bg-surface p-5 shadow-card md:p-6" style={{ animationDelay: "40ms" }}>
          <h2 className="font-semibold">Tu ciclo</h2>
          <div>
            <Field
              label="Ganancia que quieres lograr en el ciclo (USD)"
              name="target"
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              hint="Normalmente, lo que quieres retirar."
            />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink-3">Apex 50K:</span>
              {APEX_TARGETS.map(([label, v]) => (
                <button
                  key={label}
                  onClick={() => setTarget(v)}
                  className={`rounded-full border px-3 py-1 ${target === v ? "border-accent bg-accent text-accent-ink" : "border-line text-ink-2 hover:border-ink-3 hover:text-ink"}`}
                >
                  {label} · ${Number(v).toLocaleString("es-CL")}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-ink">Días que ya operaste en este ciclo</p>
            <p className="text-xs text-ink-3">Anota el resultado de cada día. Una pérdida va con signo menos (−500). Déjalo vacío si aún no partes.</p>
            <ul className="mt-3 space-y-2">
              {days.map((v, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-sm text-ink-2">Día {i + 1}</span>
                  <input
                    inputMode="text"
                    aria-label={`Resultado del día ${i + 1} en USD`}
                    value={v}
                    onChange={(e) => setDay(i, e.target.value)}
                    placeholder="0"
                    className="num h-10 w-full min-w-0 rounded-xl border border-line bg-surface px-3.5"
                  />
                  <button
                    onClick={() => setDays((p) => p.filter((_, j) => j !== i))}
                    aria-label={`Quitar día ${i + 1}`}
                    className="grid size-10 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-debit/10 hover:text-debit"
                  >
                    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setDays((p) => [...p, ""])} className="h-10 rounded-full border border-line bg-surface px-4 text-sm font-medium hover:border-ink-3">
                + Agregar día
              </button>
              {days.length > 0 && (
                <button onClick={() => setDays([])} className="h-10 px-2 text-sm text-ink-2 hover:text-ink">
                  Borrar días
                </button>
              )}
            </div>
          </div>
        </section>
      </div>

      <section className="rise flex flex-col self-start rounded-3xl border border-transparent bg-hero p-5 text-hero-ink shadow-card md:p-6 lg:sticky lg:top-24" style={{ animationDelay: "80ms" }} aria-live="polite">
        {r.done ? (
          <>
            <h2 className="text-sm text-hero-ink-2">Resultado</h2>
            <p className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-hero-credit">Ciclo cumplido</p>
            <p className="mt-2 text-sm text-hero-ink-2">Ya tienes la ganancia, los días y la consistencia. Puedes pedir el retiro.</p>
          </>
        ) : (
          <>
            <h2 className="text-sm text-hero-ink-2">Te falta generar</h2>
            <p className="num mt-1 text-5xl font-semibold tracking-[-0.04em]">{formatMoney(r.remaining, "usd")}</p>
            <p className="mt-3 text-sm">
              {r.daysLeft === 1 ? "En 1 día" : `En ${r.daysLeft} días`} de <strong className="num">{formatMoney(r.perDay, "usd")}</strong>
              {r.daysLeft > 1 ? " cada uno" : ""}
              {r.remaining.isZero() ? " (ya tienes la ganancia; solo faltan días rentables)" : ""}.
            </p>
            <p className="mt-1 text-sm text-hero-ink-2">
              Así terminas con <span className="num">{formatMoney(r.projectedTotal, "usd")}</span> y una consistencia de <span className="num">{pct(r.projectedPct)}</span>.
            </p>
          </>
        )}

        {r.targetRaised && (
          <p className="mt-4 rounded-2xl bg-hero-ink/10 px-4 py-3 text-sm">
            Tu mejor día (<span className="num">{formatMoney(r.bestDay, "usd")}</span>) te obliga a ganar {strict ? "más de" : "al menos"}{" "}
            <strong className="num">{formatMoney(strict ? r.minTotalForBestDay.sub("0.01") : r.minTotalForBestDay, "usd")}</strong> en el ciclo, más que tu objetivo.
          </p>
        )}

        <dl className="num mt-5 divide-y divide-hero-ink/15 border-t border-hero-ink/15 text-sm">
          <div className="flex items-baseline justify-between gap-3 py-2.5">
            <dt className="text-hero-ink-2">
              Tope para un solo día
              <span className="block text-xs">{strict ? "menos del" : "hasta el"} {lim} del total</span>
            </dt>
            <dd className="font-semibold">{formatMoney(r.maxDay, "usd")}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-2.5">
            <dt className="text-hero-ink-2">Ganancia hasta ahora</dt>
            <dd className={`font-semibold ${r.total.isNegative() ? "text-hero-debit" : ""}`}>{formatMoney(r.total, "usd")}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-2.5">
            <dt className="text-hero-ink-2">Mejor día</dt>
            <dd className="font-semibold">{formatMoney(r.bestDay, "usd")}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-2.5">
            <dt className="text-hero-ink-2">Consistencia actual</dt>
            <dd className={`font-semibold ${r.pct === null ? "" : r.okNow ? "text-hero-credit" : "text-hero-debit"}`}>
              {pct(r.pct)}
              {r.pct !== null && <span className="ml-1.5 font-normal">{r.okNow ? "cumple" : "no cumple"}</span>}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-2.5">
            <dt className="text-hero-ink-2">Días rentables</dt>
            <dd className="font-semibold">
              {r.validDays}
              {Number(num(minDays, "0")) > 0 && <span className="font-normal text-hero-ink-2"> de {Math.trunc(Number(num(minDays, "0")))}</span>}
            </dd>
          </div>
        </dl>
      </section>

      <p className="text-xs text-ink-3 lg:col-span-2">
        Consistencia = mejor día ÷ ganancia neta del ciclo. Es una calculadora: confirma con tu empresa el límite, si el valor exacto vale, y cómo
        cuentan los días con pérdida. No se guarda ni afecta tu ROI real.
      </p>
    </div>
  );
}
