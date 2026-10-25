"use client";

import { useEffect, useId, useRef, useState } from "react";

/** Un tramo del gráfico (día, semana o mes), en USD como number ya redondeado. */
export interface ChartPoint {
  start: string; // AAAA-MM-DD
  end: string;
  costs: number;
  received: number; // real + estimado
  estimated: number; // parte estimada de received
  net: number;
  cumulative: number; // beneficio acumulado desde el primer movimiento
}
export type ChartBucket = "day" | "week" | "month";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const dayLabel = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
function label(p: ChartPoint, b: ChartBucket, long = false) {
  if (b === "month") return `${MONTHS[Number(p.start.slice(5, 7)) - 1]} ${long ? p.start.slice(0, 4) : p.start.slice(2, 4)}`;
  if (b === "week") return long ? `${dayLabel(p.start)} – ${dayLabel(p.end)}` : dayLabel(p.start);
  return dayLabel(p.start);
}
const usd = new Intl.NumberFormat("es-CL", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${usd.format(Math.abs(v))}`;
const short = (v: number) =>
  Math.abs(v) >= 1000 ? `${v < 0 ? "−" : ""}$${(Math.abs(v) / 1000).toLocaleString("es-CL", { maximumFractionDigits: 1 })}k` : `${v < 0 ? "−" : ""}$${Math.abs(v)}`;

/** Escala "bonita" para el eje: 4 marcas redondas. */
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

/** Ancho real del contenedor: el SVG se dibuja 1:1 para que el texto no se achique en el celular. */
function useWidth(initial = 720) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(120, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Barra con el extremo superior redondeado y la base recta sobre el eje (o sobre el tramo de abajo). */
function barPath(x: number, w: number, yTop: number, yBase: number, roundTop: boolean) {
  const h = yBase - yTop;
  if (h <= 0) return "";
  const r = roundTop ? Math.min(4, h, w / 2) : 0;
  return `M${x},${yBase} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + w - r} Q${x + w},${yTop} ${x + w},${yTop + r} V${yBase} Z`;
}

// ---------------------------------------------------------------------------
// Mini gráficos de las tarjetas
// ---------------------------------------------------------------------------
export function Sparkline({ values, kind = "line", onHero = false, label: aria }: { values: number[]; kind?: "line" | "bars"; onHero?: boolean; label: string }) {
  const [ref, W] = useWidth(160);
  const H = 44;
  const color = onHero ? "var(--hero-ink)" : "var(--series-received)";
  if (values.length < 2 || values.every((v) => v === 0)) return <div ref={ref} className="h-11" aria-hidden="true" />;
  const min = Math.min(0, ...values);
  const max = Math.max(...values, min + 1);
  const y = (v: number) => 3 + (H - 6) * (1 - (v - min) / (max - min));
  if (kind === "bars") {
    const band = W / values.length;
    const bw = Math.max(2, Math.min(10, band - 3));
    return (
      <div ref={ref} className="h-11">
        <svg width={W} height={H} role="img" aria-label={aria} className="block overflow-visible">
          {values.map((v, i) => (
            <path
              key={i}
              className="grow"
              style={{ animationDelay: `${i * 18}ms` }}
              d={barPath(band * i + (band - bw) / 2, bw, Math.min(y(v), y(0) - (v > 0 ? 2 : 0)), y(0), true)}
              fill={color}
              opacity={v > 0 ? 0.9 : 0}
            />
          ))}
        </svg>
      </div>
    );
  }
  const x = (i: number) => 2 + ((W - 4) * i) / (values.length - 1);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <div ref={ref} className="h-11">
      <svg width={W} height={H} role="img" aria-label={aria} className="block overflow-visible">
        <path d={d} pathLength={1} className="draw" fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={3} fill={color} />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gráfico principal: barras (costos vs recibido) o beneficio acumulado
// ---------------------------------------------------------------------------
const PAD = { l: 48, r: 10, t: 14, b: 30 };

function Tip({ p, bucket, x, W }: { p: ChartPoint; bucket: ChartBucket; x: number; W: number }) {
  const left = Math.min(Math.max(x, 112), W - 112);
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-1 z-10 w-52 -translate-x-1/2 rounded-2xl border border-line bg-surface p-3.5 text-xs shadow-[0_12px_32px_-12px_rgb(0_0_0/0.25)]"
      style={{ left }}
    >
      <p className="mb-2 font-semibold text-ink">{label(p, bucket, true)}</p>
      <dl className="num grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-ink-2">
        <dt className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-sm bg-series-received" /> Recibido real
        </dt>
        <dd className="text-right text-ink">{usd.format(p.received - p.estimated)}</dd>
        {p.estimated > 0 && (
          <>
            <dt className="flex items-center gap-2">
              <span className="inline-block size-2.5 rounded-sm border border-series-received bg-[repeating-linear-gradient(45deg,var(--series-received)_0_1.5px,transparent_1.5px_4px)]" />{" "}
              Estimado
            </dt>
            <dd className="est text-right">{usd.format(p.estimated)}</dd>
          </>
        )}
        <dt className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-sm bg-series-cost" /> Costos
        </dt>
        <dd className="text-right text-ink">{usd.format(p.costs)}</dd>
        <dt className="mt-1 border-t border-line pt-1.5">Resultado</dt>
        <dd className={`mt-1 border-t border-line pt-1.5 text-right font-semibold ${p.net < 0 ? "text-debit" : "text-credit"}`}>{signed(p.net)}</dd>
        <dt>Acumulado</dt>
        <dd className="text-right font-semibold text-ink">{signed(p.cumulative)}</dd>
      </dl>
    </div>
  );
}

function XLabels({ data, bucket, x, H, innerW }: { data: ChartPoint[]; bucket: ChartBucket; x: (i: number) => number; H: number; innerW: number }) {
  const every = Math.ceil(data.length / Math.max(2, Math.floor(innerW / 56)));
  return (
    <>
      {data.map((p, i) =>
        (i % every === 0 && data.length - 1 - i >= every) || i === data.length - 1 ? (
          <text key={p.start} x={x(i)} y={H - 8} textAnchor="middle" className="fill-ink-3 text-[11px]">
            {label(p, bucket)}
          </text>
        ) : null,
      )}
    </>
  );
}

function Bars({ data, bucket }: { data: ChartPoint[]; bucket: ChartBucket }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth();
  const hatch = useId().replace(/:/g, "");
  const H = W < 500 ? 230 : 280;
  const max = Math.max(...data.map((p) => Math.max(p.costs, p.received)), 1);
  const { hi, ticks } = niceTicks(0, max);
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const band = innerW / data.length;
  const barW = Math.min(26, Math.max(2, (band - 8) / 2));
  const y = (v: number) => PAD.t + innerH - (v / hi) * innerH;
  const cx = (i: number) => PAD.l + band * (i + 0.5);

  return (
    <div className="relative" ref={ref}>
      {hover !== null && <Tip p={data[hover]} bucket={bucket} x={cx(hover)} W={W} />}
      <svg width={W} height={H} className="block" role="img" aria-label="Costos y recibido por tramo" onMouseLeave={() => setHover(null)}>
        <defs>
          <pattern id={hatch} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="var(--series-received)" strokeWidth="1.8" />
          </pattern>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeDasharray={t === 0 ? undefined : "3 4"} />
            <text x={PAD.l - 10} y={y(t) + 4} textAnchor="end" className="num fill-ink-3 text-[11px]">
              {short(t)}
            </text>
          </g>
        ))}
        {data.map((p, i) => {
          const dim = hover !== null && hover !== i ? 0.35 : 1;
          const xr = cx(i) + 1;
          const real = p.received - p.estimated;
          return (
            <g key={p.start} opacity={dim} style={{ transition: "opacity 150ms" }}>
              <path className="grow" style={{ animationDelay: `${i * 22}ms` }} d={barPath(cx(i) - barW - 1, barW, y(p.costs), y(0), true)} fill="var(--series-cost)" />
              <g className="grow" style={{ animationDelay: `${i * 22 + 60}ms` }}>
                <path d={barPath(xr, barW, y(real), y(0), p.estimated <= 0)} fill="var(--series-received)" />
                {p.estimated > 0 && (
                  <path
                    d={barPath(xr + 0.5, barW - 1, y(p.received) + 0.5, y(real) - (real > 0 ? 1.5 : 0.5), true)}
                    fill={`url(#${hatch})`}
                    stroke="var(--series-received)"
                    strokeWidth={1}
                  />
                )}
              </g>
            </g>
          );
        })}
        <XLabels data={data} bucket={bucket} x={cx} H={H} innerW={innerW} />
        {data.map((p, i) => (
          <rect
            key={p.start}
            x={PAD.l + band * i}
            y={PAD.t}
            width={band}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onClick={() => setHover(hover === i ? null : i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            tabIndex={0}
            aria-label={`${label(p, bucket, true)}: recibido ${usd.format(p.received)}, costos ${usd.format(p.costs)}`}
          />
        ))}
      </svg>
    </div>
  );
}

function Cumulative({ data, bucket }: { data: ChartPoint[]; bucket: ChartBucket }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth();
  const grad = useId().replace(/:/g, "");
  const H = W < 500 ? 230 : 280;
  const vals = data.map((p) => p.cumulative);
  const { lo, hi, ticks } = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals));
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const band = innerW / data.length;
  const x = (i: number) => PAD.l + band * (i + 0.5);
  const y = (v: number) => PAD.t + innerH - ((v - lo) / (hi - lo || 1)) * innerH;
  // Curva suave (Catmull-Rom → Bézier) que pasa por cada punto
  const pts = data.map((p, i) => [x(i), y(p.cumulative)] as const);
  let line = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t = 0.18;
    line += ` C${p1[0] + (p2[0] - p0[0]) * t},${p1[1] + (p2[1] - p0[1]) * t} ${p2[0] - (p3[0] - p1[0]) * t},${p2[1] - (p3[1] - p1[1]) * t} ${p2[0]},${p2[1]}`;
  }
  const area = `${line} L${pts[pts.length - 1][0]},${y(lo)} L${pts[0][0]},${y(lo)} Z`;
  const last = data[data.length - 1];

  return (
    <div className="relative" ref={ref}>
      {hover !== null && <Tip p={data[hover]} bucket={bucket} x={x(hover)} W={W} />}
      <svg width={W} height={H} className="block" role="img" aria-label="Beneficio acumulado" onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={grad} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--series-received)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--series-received)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--ink-3)" : "var(--grid)"} strokeDasharray={t === 0 ? undefined : "3 4"} />
            <text x={PAD.l - 10} y={y(t) + 4} textAnchor="end" className="num fill-ink-3 text-[11px]">
              {short(t)}
            </text>
          </g>
        ))}
        <path d={area} fill={`url(#${grad})`} className="rise" />
        <path d={line} pathLength={1} className="draw" fill="none" stroke="var(--series-received)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + innerH} stroke="var(--ink-3)" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(data[hover].cumulative)} r={6} fill="var(--surface)" stroke="var(--series-received)" strokeWidth={2.5} />
          </>
        )}
        {hover === null && last && (
          <>
            <circle cx={x(data.length - 1)} cy={y(last.cumulative)} r={4.5} fill="var(--series-received)" stroke="var(--surface)" strokeWidth={2} />
            <text x={x(data.length - 1) - 8} y={y(last.cumulative) - 12} textAnchor="end" className="num fill-ink text-[12px] font-semibold">
              {signed(last.cumulative)}
            </text>
          </>
        )}
        <XLabels data={data} bucket={bucket} x={x} H={H} innerW={innerW} />
        {data.map((p, i) => (
          <rect
            key={p.start}
            x={x(i) - band / 2}
            y={PAD.t}
            width={band}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onClick={() => setHover(hover === i ? null : i)}
            tabIndex={-1}
          />
        ))}
      </svg>
    </div>
  );
}

function Table({ data, bucket }: { data: ChartPoint[]; bucket: ChartBucket }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-ink-2 hover:text-ink">Ver como tabla</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="num w-full min-w-[34rem]">
          <thead className="text-left text-ink-2">
            <tr className="border-b border-line">
              <th className="py-2 pr-4 font-medium">{bucket === "month" ? "Mes" : bucket === "week" ? "Semana" : "Día"}</th>
              <th className="py-2 pr-4 text-right font-medium">Costos</th>
              <th className="py-2 pr-4 text-right font-medium">Recibido</th>
              <th className="py-2 pr-4 text-right font-medium">Resultado</th>
              <th className="py-2 text-right font-medium">Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.start} className="border-b border-line last:border-0">
                <td className="py-1.5 pr-4">{label(p, bucket, true)}</td>
                <td className="py-1.5 pr-4 text-right">{usd.format(p.costs)}</td>
                <td className={`py-1.5 pr-4 text-right ${p.estimated > 0 ? "est" : ""}`}>{usd.format(p.received)}</td>
                <td className="py-1.5 pr-4 text-right">{signed(p.net)}</td>
                <td className="py-1.5 text-right font-medium">{signed(p.cumulative)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-ink-3">
          <span className="est">Punteado</span> = incluye recibido estimado.
        </p>
      </div>
    </details>
  );
}

/** Tarjeta del gráfico principal con selector Barras / Acumulado y leyenda. */
export function FlowChart({ data, bucket, headline, headlineNote, delta }: { data: ChartPoint[]; bucket: ChartBucket; headline: string; headlineNote: string; delta?: React.ReactNode }) {
  const [view, setView] = useState<"bars" | "line">("bars");
  const hasEstimate = data.some((p) => p.estimated > 0);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-ink-2">{view === "bars" ? "Costos y recibido" : "Beneficio acumulado"}</h2>
          <p className="num mt-1 flex items-center gap-2 text-3xl font-semibold tracking-[-0.03em] md:text-4xl">
            {headline} {delta}
          </p>
          <p className="mt-1 text-xs text-ink-3">{headlineNote}</p>
        </div>
        <div className="inline-flex rounded-full bg-surface-2 p-1 shadow-[inset_0_0_0_1px_var(--line)]" role="tablist" aria-label="Tipo de gráfico">
          {(
            [
              ["bars", "Barras"],
              ["line", "Acumulado"],
            ] as const
          ).map(([k, t]) => (
            <button
              key={k}
              role="tab"
              aria-selected={view === k}
              onClick={() => setView(k)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${view === k ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {view === "bars" && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Leyenda">
          <li className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm bg-series-received" /> Recibido
          </li>
          {hasEstimate && (
            <li className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm border border-series-received bg-[repeating-linear-gradient(45deg,var(--series-received)_0_1.5px,transparent_1.5px_4px)]" />{" "}
              Estimado
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm bg-series-cost" /> Costos
          </li>
        </ul>
      )}
      {view === "bars" ? <Bars data={data} bucket={bucket} /> : <Cumulative data={data} bucket={bucket} />}
      <Table data={data} bucket={bucket} />
    </div>
  );
}
