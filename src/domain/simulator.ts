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
