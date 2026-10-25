/** Retiros (payouts) por cuenta financiada: cuántos van y cuántos quedan antes de "quemarla". */

export interface PayoutLite {
  account_id: string;
  status: string; // draft | requested | approved | paid | rejected | cancelled
}

export interface Withdrawals {
  paid: number; // payouts pagados
  inProcess: number; // solicitados o aprobados, aún sin pagar
}

/** Cuenta los retiros por cuenta. Rechazados, cancelados y borradores no cuentan. */
export function countWithdrawals(payouts: PayoutLite[]): Map<string, Withdrawals> {
  const out = new Map<string, Withdrawals>();
  for (const p of payouts) {
    const w = out.get(p.account_id) ?? { paid: 0, inProcess: 0 };
    if (p.status === "paid") w.paid++;
    else if (p.status === "requested" || p.status === "approved") w.inProcess++;
    else continue;
    out.set(p.account_id, w);
  }
  return out;
}

export type WithdrawalStage = "open" | "last" | "done";

/**
 * open = quedan 2 o más; last = queda uno; done = llegó al máximo (toca cerrarla).
 * Los que están en proceso cuentan como usados: ya se pidieron.
 */
export function withdrawalStage(w: Withdrawals, max: number | null): { used: number; left: number | null; stage: WithdrawalStage } {
  const used = w.paid + w.inProcess;
  if (max === null) return { used, left: null, stage: "open" };
  const left = Math.max(0, max - used);
  return { used, left, stage: left === 0 ? "done" : left === 1 ? "last" : "open" };
}
