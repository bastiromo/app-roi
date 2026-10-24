import { addDual, d, Decimal, type Dual, scaleDual, subDual, toDual, ZERO } from "./money";
import type { Expense, Ledger, Payout, Receipt, Scope } from "./types";

// ---------------------------------------------------------------------------
// Estimaciones (nunca cuentan como dinero recibido)
// ---------------------------------------------------------------------------

/** Neto estimado de un payout: retiro × % del trader − comisión de la empresa. */
export function estimatePayoutNet(p: Payout): Decimal {
  const pct = d(p.traderSharePct);
  if (pct.lt(0) || pct.gt(100)) throw new Error(`% del trader fuera de rango en ${p.id}: ${p.traderSharePct}`);
  return d(p.requestedAmount).mul(pct).div(100).sub(d(p.firmFeeAmount ?? "0"));
}

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

export interface Issue {
  ref: string;
  message: string;
}

export function validateLedger(l: Ledger): Issue[] {
  const issues: Issue[] = [];
  const payouts = new Map(l.payouts.map((p) => [p.id, p]));
  const expenses = new Map(l.expenses.map((e) => [e.id, e]));

  const refs = new Map<string, string>();
  for (const e of l.expenses) {
    if (e.externalRef) {
      const key = `${e.firmId ?? "-"}|${e.externalRef}`;
      if (refs.has(key)) issues.push({ ref: e.id, message: `Referencia duplicada ${e.externalRef} (ya usada en ${refs.get(key)})` });
      else refs.set(key, e.id);
    }
    if (e.kind === "refund") {
      const orig = e.refundOfId ? expenses.get(e.refundOfId) : undefined;
      if (!orig) issues.push({ ref: e.id, message: "Reembolso sin gasto original vinculado" });
      else if (d(e.amount).gt(d(orig.amount)) && e.currency === orig.currency)
        issues.push({ ref: e.id, message: "El reembolso supera el gasto original" });
    }
  }

  const txs = new Map<string, string>();
  for (const r of l.receipts) {
    if (r.txHash) {
      if (txs.has(r.txHash)) issues.push({ ref: r.id, message: `Hash de transacción duplicado (ya usado en ${txs.get(r.txHash)})` });
      else txs.set(r.txHash, r.id);
    }
    if (r.allocations.length === 0) issues.push({ ref: r.id, message: "Recibo sin payout asociado" });
    const explicit = r.allocations.filter((a) => a.amount !== undefined);
    if (explicit.length > 0 && explicit.length !== r.allocations.length)
      issues.push({ ref: r.id, message: "Asignación mixta: indica el monto para todos los payouts o para ninguno" });
    if (explicit.length > 0 && explicit.length === r.allocations.length) {
      const sum = explicit.reduce((s, a) => s.add(d(a.amount!)), d(0));
      if (!sum.eq(d(r.amount))) issues.push({ ref: r.id, message: `Las asignaciones suman ${sum} y el recibo es ${r.amount}` });
    }
    for (const a of r.allocations) {
      const p = payouts.get(a.payoutId);
      if (!p) issues.push({ ref: r.id, message: `Payout ${a.payoutId} no existe` });
      else if (p.status !== "paid") issues.push({ ref: r.id, message: `Payout ${p.id} está "${p.status}"; solo un payout pagado puede tener dinero recibido` });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Reparto de un recibo entre payouts
// ---------------------------------------------------------------------------

/** Devuelve cuánto del recibo (en su moneda) corresponde a cada payout. La suma es exacta. */
export function allocateReceipt(r: Receipt, payouts: Map<string, Payout>): Map<string, Decimal> {
  const out = new Map<string, Decimal>();
  const total = d(r.amount);
  if (r.allocations.every((a) => a.amount !== undefined)) {
    for (const a of r.allocations) out.set(a.payoutId, d(a.amount!));
    return out;
  }
  const weights = r.allocations.map((a) => {
    const p = payouts.get(a.payoutId);
    if (!p) throw new Error(`Payout ${a.payoutId} no existe`);
    return estimatePayoutNet(p);
  });
  const wSum = weights.reduce((s, w) => s.add(w), d(0));
  let assigned = d(0);
  r.allocations.forEach((a, i) => {
    const last = i === r.allocations.length - 1;
    const share = last
      ? total.sub(assigned)
      : wSum.isZero()
        ? total.div(r.allocations.length)
        : total.mul(weights[i]).div(wSum);
    out.set(a.payoutId, share);
    assigned = assigned.add(share);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Resumen financiero
// ---------------------------------------------------------------------------

export interface Summary {
  costsGross: Dual; // gastos pagados
  refunds: Dual; // reembolsos recibidos
  C: Dual; // costos netos ("inversión")
  R: Dual; // dinero efectivamente recibido
  B: Dual; // beneficio antes de impuestos
  T: Dual; // impuestos pagados (solo en vista global)
  N: Dual; // beneficio neto
  roiPrePct: { usd: Decimal | null; clp: Decimal | null };
  roiNetPct: { usd: Decimal | null; clp: Decimal | null };
  recovered: Dual; // min(R, C)
  recoveryPct: { usd: Decimal | null; clp: Decimal | null }; // R / C
  receivableUsd: Decimal; // estimado por cobrar (fuera del ROI)
  taxesIncluded: boolean;
}

function inDate(date: string, s: Scope): boolean {
  return (!s.from || date >= s.from) && (!s.to || date <= s.to);
}

function expenseInScope(e: Expense, s: Scope): boolean {
  if (s.firmId && e.firmId !== s.firmId) return false;
  if (s.accountIds && (!e.accountId || !s.accountIds.includes(e.accountId))) return false;
  return inDate(e.occurredOn, s);
}

function payoutInScope(p: Payout, s: Scope): boolean {
  if (s.firmId && p.firmId !== s.firmId) return false;
  if (s.accountIds && !s.accountIds.includes(p.accountId)) return false;
  return true;
}

function pct(num: Decimal, den: Decimal): Decimal | null {
  return den.isZero() ? null : num.div(den).mul(100);
}

export function summarize(l: Ledger, scope: Scope = {}): Summary {
  const payouts = new Map(l.payouts.map((p) => [p.id, p]));

  let costsGross = ZERO;
  let refunds = ZERO;
  for (const e of l.expenses) {
    if (e.status !== "paid" || !expenseInScope(e, scope)) continue;
    if (e.kind === "cost") costsGross = addDual(costsGross, toDual(e));
    else refunds = addDual(refunds, toDual(e));
  }
  const C = subDual(costsGross, refunds);

  let R = ZERO;
  const received = new Set<string>();
  for (const r of l.receipts) {
    if (!inDate(r.receivedOn, scope)) continue;
    const dual = toDual(r);
    const total = d(r.amount);
    for (const [payoutId, share] of allocateReceipt(r, payouts)) {
      const p = payouts.get(payoutId);
      if (!p || p.status !== "paid") continue; // validateLedger lo reporta
      received.add(payoutId);
      if (!payoutInScope(p, scope)) continue;
      R = addDual(R, total.isZero() ? ZERO : scaleDual(dual, share.div(total)));
    }
  }

  let receivableUsd = d(0);
  for (const p of l.payouts) {
    if (!payoutInScope(p, scope)) continue;
    const pending = p.status === "requested" || p.status === "approved";
    const paidNotReceived = p.status === "paid" && !received.has(p.id);
    if (pending || paidNotReceived) receivableUsd = receivableUsd.add(estimatePayoutNet(p));
  }

  const taxesIncluded = !scope.firmId && !scope.accountIds;
  let T = ZERO;
  if (taxesIncluded) for (const t of l.taxes) if (inDate(t.paidOn, scope)) T = addDual(T, toDual(t));

  const B = subDual(R, C);
  const N = subDual(B, T);
  const recovered = { usd: Decimal.min(R.usd, C.usd), clp: Decimal.min(R.clp, C.clp) };

  return {
    costsGross,
    refunds,
    C,
    R,
    B,
    T,
    N,
    roiPrePct: { usd: pct(B.usd, C.usd), clp: pct(B.clp, C.clp) },
    roiNetPct: { usd: pct(N.usd, C.usd), clp: pct(N.clp, C.clp) },
    recovered,
    recoveryPct: { usd: pct(R.usd, C.usd), clp: pct(R.clp, C.clp) },
    receivableUsd,
    taxesIncluded,
  };
}
