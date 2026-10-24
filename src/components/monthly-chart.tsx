"use client";

import { useEffect, useRef, useState } from "react";

export interface ChartMonth {
  month: string; // AAAA-MM
  costs: number;
  received: number;
  net: number;
  cumulative: number;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const label = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const usd = new Intl.NumberFormat("es-CL", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${usd.format(Math.abs(v))}`;

/** Escala "bonita" para el eje: máximo redondeado y 4 marcas. */
function niceTicks(min: number, max: number) {
  const span = Math.max(max - min, 1);
  const raw = span / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v));
  return { lo, hi, ticks };
}

const short = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("es-CL", { maximumFractionDigits: 1 })}k` : String(v));

const PAD = { l: 44, r: 8, t: 12, b: 28 };

/** Ancho real del contenedor: el SVG se dibuja a escala 1:1 para que el texto no se achique en el celular. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function Tooltip({ m, x, W }: { m: ChartMonth; x: number; W: number }) {
  const left = Math.min(Math.max(x / W, 0.15), 0.85) * 100;
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-0 z-10 w-48 -translate-x-1/2 rounded-lg border border-line bg-surface p-3 text-xs shadow-sm"
      style={{ left: `${left}%` }}
    >
      <p className="mb-1.5 font-semibold text-ink">{label(m.month)}</p>
      <dl className="num grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-ink-2">
        <dt className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-sm bg-series-received" /> Recibido
        </dt>
        <dd className="text-right text-ink">{usd.format(m.received)}</dd>
        <dt className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-sm bg-series-cost" /> Costos
        </dt>
        <dd className="text-right text-ink">{usd.format(m.costs)}</dd>
        <dt>Resultado del mes</dt>
        <dd className="text-right text-ink">{signed(m.net)}</dd>
        <dt>Acumulado</dt>
        <dd className="text-right font-semibold text-ink">{signed(m.cumulative)}</dd>
      </dl>
    </div>
  );
}

/** Barras agrupadas: costos vs recibido por mes. */
export function MonthlyBars({ data }: { data: ChartMonth[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth();
  const H = W < 500 ? 200 : 240;
  const max = Math.max(...data.map((m) => Math.max(m.costs, m.received)), 1);
  const { hi, ticks } = niceTicks(0, max);
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const band = innerW / data.length;
  const barW = Math.min(28, Math.max(4, (band - 10) / 2));
  const y = (v: number) => PAD.t + innerH - (v / hi) * innerH;
  const every = Math.ceil(data.length / Math.max(2, Math.floor(innerW / 64)));

  return (
    <div className="relative" ref={ref}>
      {hover !== null && <Tooltip m={data[hover]} x={PAD.l + band * (hover + 0.5)} W={W} />}
      <svg width={W} height={H} className="block" role="img" aria-label="Costos y recibido por mes" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" className="num fill-ink-3 text-[11px]">
              {short(t)}
            </text>
          </g>
        ))}
        {data.map((m, i) => {
          const cx = PAD.l + band * (i + 0.5);
          const bar = (v: number, x: number, color: string) => {
            const h = Math.max(0, y(0) - y(v));
            if (h <= 0) return null;
            const r = Math.min(4, h, barW / 2);
            // Extremo superior redondeado, base recta sobre el eje
            return (
              <path
                d={`M${x},${y(0)} V${y(v) + r} Q${x},${y(v)} ${x + r},${y(v)} H${x + barW - r} Q${x + barW},${y(v)} ${x + barW},${y(v) + r} V${y(0)} Z`}
                fill={color}
                opacity={hover === null || hover === i ? 1 : 0.45}
              />
            );
          };
          return (
            <g key={m.month}>
              {bar(m.costs, cx - barW - 1, "var(--series-cost)")}
              {bar(m.received, cx + 1, "var(--series-received)")}
              {((i % every === 0 && data.length - 1 - i >= every) || i === data.length - 1) && (
                <text x={cx} y={H - 8} textAnchor="middle" className="fill-ink-3 text-[11px]">
                  {label(m.month)}
                </text>
              )}
              <rect
                x={PAD.l + band * i}
                y={PAD.t}
                width={band}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${label(m.month)}: recibido ${usd.format(m.received)}, costos ${usd.format(m.costs)}`}
              />
            </g>
          );
        })}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="var(--ink-3)" strokeWidth={1} />
      </svg>
    </div>
  );
}

/** Línea del beneficio acumulado, con el cero marcado (punto de recuperación). */
export function CumulativeLine({ data }: { data: ChartMonth[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth();
  const H = W < 500 ? 170 : 200;
  const vals = data.map((m) => m.cumulative);
  const { lo, hi, ticks } = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals));
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  // Mismos centros que las barras: cada mes queda alineado entre los dos gráficos
  const band = innerW / data.length;
  const x = (i: number) => PAD.l + band * (i + 0.5);
  const y = (v: number) => PAD.t + innerH - ((v - lo) / (hi - lo || 1)) * innerH;
  const path = data.map((m, i) => `${i ? "L" : "M"}${x(i)},${y(m.cumulative)}`).join(" ");
  const last = data[data.length - 1];
  const every = Math.ceil(data.length / Math.max(2, Math.floor(innerW / 64)));

  return (
    <div className="relative" ref={ref}>
      {hover !== null && <Tooltip m={data[hover]} x={x(hover)} W={W} />}
      <svg width={W} height={H} className="block" role="img" aria-label="Beneficio acumulado por mes" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--ink-3)" : "var(--grid)"} strokeWidth={1} />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" className="num fill-ink-3 text-[11px]">
              {short(t)}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {data.map((m, i) => (
          <circle key={m.month} cx={x(i)} cy={y(m.cumulative)} r={3} fill="var(--ink)" />
        ))}
        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + innerH} stroke="var(--ink-3)" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(data[hover].cumulative)} r={5} fill="var(--ink)" stroke="var(--surface)" strokeWidth={2} />
          </>
        )}
        {last && (
          <text x={x(data.length - 1)} y={y(last.cumulative) - 10} textAnchor="end" className="num fill-ink text-[12px] font-semibold">
            {signed(last.cumulative)}
          </text>
        )}
        {data.map((m, i) => (
          <g key={m.month}>
            {((i % every === 0 && data.length - 1 - i >= every) || i === data.length - 1) && (
              <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-ink-3 text-[11px]">
                {label(m.month)}
              </text>
            )}
            <rect
              x={x(i) - band / 2}
              y={PAD.t}
              width={band}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              tabIndex={-1}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

export function MonthlyTable({ data }: { data: ChartMonth[] }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-ink-2 hover:text-ink">Ver como tabla</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="num w-full min-w-[32rem]">
          <thead className="text-left text-ink-2">
            <tr className="border-b border-line">
              <th className="py-2 pr-4 font-medium">Mes</th>
              <th className="py-2 pr-4 text-right font-medium">Costos</th>
              <th className="py-2 pr-4 text-right font-medium">Recibido</th>
              <th className="py-2 pr-4 text-right font-medium">Resultado</th>
              <th className="py-2 text-right font-medium">Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {data.map((m) => (
              <tr key={m.month} className="border-b border-line last:border-0">
                <td className="py-1.5 pr-4">{label(m.month)}</td>
                <td className="py-1.5 pr-4 text-right">{usd.format(m.costs)}</td>
                <td className="py-1.5 pr-4 text-right">{usd.format(m.received)}</td>
                <td className="py-1.5 pr-4 text-right">{signed(m.net)}</td>
                <td className="py-1.5 text-right font-medium">{signed(m.cumulative)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
