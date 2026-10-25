import type { FlowRow } from "./flows";
import { d, Decimal } from "./money";

/** Períodos del Resumen. "todo" = desde el primer movimiento. */
export const PERIODS = ["todo", "12m", "90d", "30d"] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_LABEL: Record<Period, string> = { todo: "Todo", "12m": "12M", "90d": "90D", "30d": "30D" };

export type Bucket = "day" | "week" | "month";

export interface Window {
  from: string; // AAAA-MM-DD, inclusive
  to: string; // inclusive
  prevFrom: string | null; // período anterior de igual largo (null en "todo")
  prevTo: string | null;
  bucket: Bucket;
}

type DatedFlow = FlowRow & { flow_date: string };

export function addDays(iso: string, n: number): string {
  const t = new Date(`${iso}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

function monthStart(iso: string, addMonths = 0): string {
  const [y, m] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + addMonths;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

/** Ventana de fechas de un período, terminando hoy (fecha de Chile). */
export function periodWindow(period: Period, today: string, firstDate: string | null): Window {
  switch (period) {
    case "30d":
    case "90d": {
      const n = period === "30d" ? 30 : 90;
      const from = addDays(today, -(n - 1));
      return { from, to: today, prevFrom: addDays(from, -n), prevTo: addDays(from, -1), bucket: period === "30d" ? "day" : "week" };
    }
    case "12m": {
      const from = monthStart(today, -11);
      return { from, to: today, prevFrom: monthStart(today, -23), prevTo: addDays(from, -1), bucket: "month" };
    }
    default: {
      const from = firstDate ? monthStart(firstDate) : monthStart(today);
      return { from, to: today, prevFrom: null, prevTo: null, bucket: "month" };
    }
  }
}

export function inWindow<T extends { flow_date: string }>(rows: T[], from: string, to: string): T[] {
  return rows.filter((r) => r.flow_date >= from && r.flow_date <= to);
}

export interface Point {
  start: string; // primer día del tramo
  end: string; // último día del tramo
  costs: Decimal;
  received: Decimal; // real + estimado
  receivedEstimated: Decimal;
  net: Decimal;
  /** Beneficio acumulado desde el primer movimiento (no desde el inicio del período). */
  cumulative: Decimal;
  /** ROI acumulado desde el primer movimiento al cierre del tramo (null sin costos). */
  cumulativeRoiPct: Decimal | null;
}

function bucketStarts(w: Window): string[] {
  const out: string[] = [];
  if (w.bucket === "month") {
    for (let m = monthStart(w.from); m <= w.to; m = monthStart(m, 1)) out.push(m < w.from ? w.from : m);
  } else {
    const step = w.bucket === "day" ? 1 : 7;
    for (let s = w.from; s <= w.to; s = addDays(s, step)) out.push(s);
  }
  return out;
}

/** Serie por tramos (día, semana o mes) dentro de la ventana. Impuestos excluidos. */
export function bucketSeries(rows: DatedFlow[], w: Window): Point[] {
  const starts = bucketStarts(w);
  const points: Point[] = starts.map((start, i) => ({
    start,
    end: i + 1 < starts.length ? addDays(starts[i + 1], -1) : w.to,
    costs: d(0),
    received: d(0),
    receivedEstimated: d(0),
    net: d(0),
    cumulative: d(0),
    cumulativeRoiPct: null,
  }));
  // Lo anterior a la ventana parte como base del acumulado
  let baseCosts = d(0);
  let baseReceived = d(0);
  for (const r of rows) {
    if (r.flow_type === "impuesto" || r.flow_date > w.to) continue;
    const v = d(r.amount_usd);
    const signedCost = r.flow_type === "costo" ? v : r.flow_type === "reembolso" ? v.neg() : null;
    if (r.flow_date < w.from) {
      if (signedCost) baseCosts = baseCosts.add(signedCost);
      else baseReceived = baseReceived.add(v);
      continue;
    }
    // Último tramo cuyo inicio es ≤ la fecha
    let i = points.length - 1;
    while (i > 0 && points[i].start > r.flow_date) i--;
    const p = points[i];
    if (signedCost) p.costs = p.costs.add(signedCost);
    else {
      p.received = p.received.add(v);
      if (r.is_estimated) p.receivedEstimated = p.receivedEstimated.add(v);
    }
  }
  let accC = baseCosts;
  let accR = baseReceived;
  for (const p of points) {
    p.net = p.received.sub(p.costs);
    accC = accC.add(p.costs);
    accR = accR.add(p.received);
    p.cumulative = accR.sub(accC);
    p.cumulativeRoiPct = accC.isZero() ? null : p.cumulative.div(accC).mul(100);
  }
  return points;
}

/** Variación porcentual (null si el período anterior fue 0). */
export function pctChange(cur: Decimal, prev: Decimal): Decimal | null {
  return prev.isZero() ? null : cur.sub(prev).div(prev.abs()).mul(100);
}
