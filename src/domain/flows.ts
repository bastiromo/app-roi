import { d, Decimal } from "./money";

/** Una fila de la vista SQL cash_flows (montos como texto para no perder precisión). */
export interface FlowRow {
  flow_type: "costo" | "reembolso" | "payout_recibido" | "impuesto";
  direction: number;
  firm_id: string | null;
  amount_usd: string;
  amount_clp: string;
  is_estimated: boolean;
}

export interface FlowTotals {
  C: Decimal;
  R: Decimal;
  REstimated: Decimal;
  T: Decimal;
  B: Decimal;
  N: Decimal;
  roiPrePct: Decimal | null;
  roiNetPct: Decimal | null;
  recoveryPct: Decimal | null;
}

/** Mismas fórmulas que summarize(), aplicadas sobre la vista de flujos. Moneda: "usd" o "clp". */
export function summarizeFlows(rows: FlowRow[], currency: "usd" | "clp" = "usd", firmId?: string): FlowTotals {
  let C = d(0);
  let R = d(0);
  let REstimated = d(0);
  let T = d(0);
  const includeTaxes = firmId === undefined;
  for (const r of rows) {
    if (firmId !== undefined && r.firm_id !== firmId) continue;
    const v = d(currency === "usd" ? r.amount_usd : r.amount_clp);
    switch (r.flow_type) {
      case "costo":
        C = C.add(v);
        break;
      case "reembolso":
        C = C.sub(v);
        break;
      case "payout_recibido":
        R = R.add(v);
        if (r.is_estimated) REstimated = REstimated.add(v);
        break;
      case "impuesto":
        if (includeTaxes) T = T.add(v);
        break;
    }
  }
  const B = R.sub(C);
  const N = B.sub(T);
  const pct = (x: Decimal) => (C.isZero() ? null : x.div(C).mul(100));
  return { C, R, REstimated, T, B, N, roiPrePct: pct(B), roiNetPct: pct(N), recoveryPct: pct(R) };
}
