import type { FlowRow } from "./flows";
import { d, Decimal } from "./money";

export interface MonthPoint {
  month: string; // AAAA-MM
  costs: Decimal; // costos netos de reembolsos (USD)
  received: Decimal; // recibido (USD), real + estimado
  net: Decimal; // received − costs del mes
  cumulative: Decimal; // beneficio acumulado hasta ese mes (sin impuestos)
}

function nextMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}

/** Serie mensual continua (sin huecos) desde el primer al último mes con movimientos. Impuestos excluidos. */
export function monthlySeries(rows: (FlowRow & { flow_date: string })[]): MonthPoint[] {
  const byMonth = new Map<string, { costs: Decimal; received: Decimal }>();
  for (const r of rows) {
    if (r.flow_type === "impuesto") continue;
    const m = r.flow_date.slice(0, 7);
    const cur = byMonth.get(m) ?? { costs: d(0), received: d(0) };
    const v = d(r.amount_usd);
    if (r.flow_type === "costo") cur.costs = cur.costs.add(v);
    else if (r.flow_type === "reembolso") cur.costs = cur.costs.sub(v);
    else cur.received = cur.received.add(v);
    byMonth.set(m, cur);
  }
  if (byMonth.size === 0) return [];
  const months = [...byMonth.keys()].sort();
  const out: MonthPoint[] = [];
  let acc = d(0);
  for (let m = months[0]; m <= months[months.length - 1]; m = nextMonth(m)) {
    const v = byMonth.get(m) ?? { costs: d(0), received: d(0) };
    const net = v.received.sub(v.costs);
    acc = acc.add(net);
    out.push({ month: m, costs: v.costs, received: v.received, net, cumulative: acc });
  }
  return out;
}

export interface FirmResult {
  firmId: string | null; // null = costos generales
  name: string;
  costs: Decimal;
  received: Decimal;
  receivedEstimated: Decimal;
  profit: Decimal;
  roiPct: Decimal | null;
  pending: Decimal;
}

/** Resultado por empresa (sin impuestos). Los costos sin empresa van en la fila "General". */
export function byFirm(
  rows: FlowRow[],
  firms: { id: string; name: string }[],
  pendingByFirm: Map<string, Decimal> = new Map(),
): FirmResult[] {
  const acc = new Map<string | null, { costs: Decimal; received: Decimal; est: Decimal }>();
  for (const r of rows) {
    if (r.flow_type === "impuesto") continue;
    const k = r.firm_id;
    const cur = acc.get(k) ?? { costs: d(0), received: d(0), est: d(0) };
    const v = d(r.amount_usd);
    if (r.flow_type === "costo") cur.costs = cur.costs.add(v);
    else if (r.flow_type === "reembolso") cur.costs = cur.costs.sub(v);
    else {
      cur.received = cur.received.add(v);
      if (r.is_estimated) cur.est = cur.est.add(v);
    }
    acc.set(k, cur);
  }
  for (const k of pendingByFirm.keys()) if (!acc.has(k)) acc.set(k, { costs: d(0), received: d(0), est: d(0) });

  const name = new Map(firms.map((f) => [f.id, f.name]));
  const out: FirmResult[] = [...acc.entries()].map(([firmId, v]) => {
    const profit = v.received.sub(v.costs);
    return {
      firmId,
      name: firmId ? (name.get(firmId) ?? "Empresa eliminada") : "General (sin empresa)",
      costs: v.costs,
      received: v.received,
      receivedEstimated: v.est,
      profit,
      roiPct: v.costs.isZero() ? null : profit.div(v.costs).mul(100),
      pending: (firmId && pendingByFirm.get(firmId)) || d(0),
    };
  });
  // Empresas por beneficio (mayor primero); "General" siempre al final
  return out.sort((a, b) => (a.firmId === null ? 1 : b.firmId === null ? -1 : b.profit.comparedTo(a.profit)));
}
