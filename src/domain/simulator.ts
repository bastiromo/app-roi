import { d, type Decimal } from "./money";

/** Simulador de packs de evaluaciones (ej. Apex 50K). Todo en USD. Son supuestos, no reglas garantizadas. */
export interface SimInput {
  packs: number; // packs comprados
  evalsPerPack: number; // evaluaciones por pack
  packPrice: string; // precio de un pack
  activationFee: string; // activación por cada evaluación aprobada
  approved: number; // evaluaciones aprobadas (se activan todas)
  withdrawing: number; // cuentas que consiguen retirar
  payoutsPerAccount: number; // retiros que cobra cada una de esas cuentas
  payoutTable: string[]; // retiro máximo de cada ciclo, en orden
}

export interface SimResult {
  evaluations: number;
  approved: number; // ya limitado a las evaluaciones compradas
  withdrawing: number; // ya limitado a las aprobadas
  payoutsPerAccount: number;
  packCost: Decimal;
  activationCost: Decimal;
  investment: Decimal;
  perAccount: Decimal; // lo que retira cada cuenta que cobra
  gross: Decimal; // retiros brutos
  profit: Decimal;
  roiPct: Decimal | null; // null si no hay inversión
  /** Cuentas que deben cobrar para recuperar la inversión (null si cada cuenta retira 0). */
  breakEven: number | null;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.trunc(Number.isFinite(v) ? v : min)));

export function simulate(i: SimInput): SimResult {
  const evaluations = clamp(i.packs, 0, 1000) * clamp(i.evalsPerPack, 1, 100);
  const approved = clamp(i.approved, 0, evaluations);
  const withdrawing = clamp(i.withdrawing, 0, approved);
  const payoutsPerAccount = clamp(i.payoutsPerAccount, 1, Math.max(1, i.payoutTable.length));
  const packCost = d(i.packPrice).mul(clamp(i.packs, 0, 1000));
  const activationCost = d(i.activationFee).mul(approved);
  const investment = packCost.add(activationCost);
  const perAccount = i.payoutTable.slice(0, payoutsPerAccount).reduce((t, v) => t.add(d(v)), d(0));
  const gross = perAccount.mul(withdrawing);
  const profit = gross.sub(investment);
  return {
    evaluations,
    approved,
    withdrawing,
    payoutsPerAccount,
    packCost,
    activationCost,
    investment,
    perAccount,
    gross,
    profit,
    roiPct: investment.isZero() ? null : profit.div(investment).mul(100),
    breakEven: perAccount.lte(0) ? null : Math.max(0, Math.ceil(investment.div(perAccount).toNumber())),
  };
}

/** Valores iniciales (Apex 50K según lo indicado por el usuario; verificar con Apex). */
export const APEX_50K: SimInput = {
  packs: 2,
  evalsPerPack: 5,
  packPrice: "95",
  activationFee: "99",
  approved: 5,
  withdrawing: 1,
  payoutsPerAccount: 1,
  payoutTable: ["1500", "2000", "2500", "2500", "3000", "3000"],
};

// ---------------------------------------------------------------------------
// Plan hacia un retiro: días de trading → balance, consistencia y días válidos
// ---------------------------------------------------------------------------
export interface PlanResult {
  days: { day: number; result: Decimal; balance: Decimal; valid: boolean }[];
  finalBalance: Decimal;
  net: Decimal;
  bestDay: Decimal;
  /** Mejor día / ganancia neta × 100 (null si no hay ganancia neta). Debe ser estrictamente menor al límite. */
  consistencyPct: Decimal | null;
  consistencyOk: boolean;
  validDays: number; // días con al menos minDay de beneficio
  daysOk: boolean;
  balanceAfter: Decimal; // tras el retiro
  safetyNetOk: boolean; // queda en o sobre el Safety Net
}

export function planToPayout(o: {
  start: string;
  results: string[];
  withdrawal: string;
  safetyNet: string;
  minDay?: string;
  minValidDays?: number;
  consistencyLimitPct?: string;
}): PlanResult {
  const minDay = d(o.minDay ?? "200");
  let balance = d(o.start);
  let bestDay = d(0);
  const days = o.results.map((r, i) => {
    const result = d(r);
    balance = balance.add(result);
    if (result.gt(bestDay)) bestDay = result;
    return { day: i + 1, result, balance, valid: result.gte(minDay) };
  });
  const net = balance.sub(d(o.start));
  const consistencyPct = net.gt(0) ? bestDay.div(net).mul(100) : null;
  const validDays = days.filter((x) => x.valid).length;
  const balanceAfter = balance.sub(d(o.withdrawal));
  return {
    days,
    finalBalance: balance,
    net,
    bestDay,
    consistencyPct,
    consistencyOk: consistencyPct !== null && consistencyPct.lt(d(o.consistencyLimitPct ?? "50")),
    validDays,
    daysOk: validDays >= (o.minValidDays ?? 5),
    balanceAfter,
    safetyNetOk: balanceAfter.gte(d(o.safetyNet)),
  };
}

// ---------------------------------------------------------------------------
// Varios ciclos seguidos: el balance que sobra de un ciclo pasa al siguiente
// ---------------------------------------------------------------------------
export interface CycleResult {
  cycle: number;
  days: Decimal[];
  gain: Decimal;
  consistencyPct: Decimal | null;
  consistencyOk: boolean;
  validDays: number;
  daysOk: boolean;
  withdrawal: Decimal;
  balanceBefore: Decimal; // antes del retiro
  balanceAfter: Decimal;
  safetyNetOk: boolean;
}

export function runCycles(o: { start: string; safetyNet: string; cycles: { days: string[]; withdrawal: string }[] }) {
  let balance = o.start;
  const cycles: CycleResult[] = o.cycles.map((c, i) => {
    const p = planToPayout({ start: balance, results: c.days, withdrawal: c.withdrawal, safetyNet: o.safetyNet });
    balance = p.balanceAfter.toString();
    return {
      cycle: i + 1,
      days: p.days.map((x) => x.result),
      gain: p.net,
      consistencyPct: p.consistencyPct,
      consistencyOk: p.consistencyOk,
      validDays: p.validDays,
      daysOk: p.daysOk,
      withdrawal: d(c.withdrawal),
      balanceBefore: p.finalBalance,
      balanceAfter: p.balanceAfter,
      safetyNetOk: p.safetyNetOk,
    };
  });
  const sum = (f: (c: CycleResult) => Decimal) => cycles.reduce((t, c) => t.add(f(c)), d(0));
  const finalBalance = d(balance);
  return {
    cycles,
    totalGain: sum((c) => c.gain),
    totalWithdrawn: sum((c) => c.withdrawal),
    validDays: cycles.reduce((t, c) => t + c.validDays, 0),
    finalBalance,
    /** Lo que queda en la cuenta sobre el balance inicial (Safety Net + lo que sobre). */
    leftInAccount: finalBalance.sub(d(o.start)),
  };
}
