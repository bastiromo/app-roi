import { d, Decimal } from "./money";

/**
 * Regla de consistencia de las prop firms: el mejor día no puede pasar de un % de la ganancia
 * neta del ciclo (ej. Apex: estrictamente menos del 50 %; otras: 40 % o 30 %).
 */
export interface ConsistencyInput {
  limitPct: string; // ej. "50"
  strict: boolean; // true: debe ser MENOR al límite; false: el límite exacto también vale
  target: string; // ganancia que quieres lograr en el ciclo (normalmente, lo que quieres retirar)
  minDays: number; // días rentables que exige la empresa (0 = sin mínimo)
  minDay: string; // ganancia mínima para que un día cuente
  days: string[]; // resultados de los días ya operados (negativo = pérdida)
}

export interface ConsistencyPlan {
  total: Decimal; // ganancia neta hasta ahora
  bestDay: Decimal;
  pct: Decimal | null; // consistencia actual (null sin ganancia neta)
  okNow: boolean; // la consistencia actual cumple
  validDays: number;
  /** Ganancia mínima del ciclo que exige tu mejor día (0 si aún no hay días ganadores). */
  minTotalForBestDay: Decimal;
  /** Ganancia a la que debes llegar: la mayor entre tu objetivo y la que exige tu mejor día. */
  requiredTotal: Decimal;
  targetRaised: boolean; // tu mejor día obliga a ganar más que tu objetivo
  remaining: Decimal; // lo que falta generar
  daysLeft: number; // días que faltan (0 = ya cumples todo)
  perDay: Decimal; // sugerencia: ganar esto cada uno de esos días
  projectedTotal: Decimal;
  projectedPct: Decimal | null;
  /** Tope para un solo día con el total proyectado (límite % × total). */
  maxDay: Decimal;
  done: boolean; // objetivo, días y consistencia cumplidos
}

const CENT = new Decimal("0.01");

export function consistencyPlan(i: ConsistencyInput): ConsistencyPlan {
  const limit = d(i.limitPct).div(100);
  const target = Decimal.max(d(i.target), 0);
  const minDay = Decimal.max(d(i.minDay), 0);
  const results = i.days.map((v) => d(v));
  const total = results.reduce((t, v) => t.add(v), d(0));
  const bestDay = results.reduce((m, v) => (v.gt(m) ? v : m), d(0));
  const validDays = results.filter((v) => v.gt(0) && v.gte(minDay)).length;
  const passes = (best: Decimal, sum: Decimal) => {
    if (best.lte(0)) return true;
    if (sum.lte(0)) return false;
    const ratio = best.div(sum);
    return i.strict ? ratio.lt(limit) : ratio.lte(limit);
  };

  // Lo mínimo que exige el mejor día: total ≥ mejor día / límite (o un centavo más si es estricto)
  const exact = bestDay.gt(0) ? bestDay.div(limit) : d(0);
  const minTotalForBestDay = bestDay.gt(0) ? (i.strict ? exact.toDecimalPlaces(2, Decimal.ROUND_FLOOR).add(CENT) : exact.toDecimalPlaces(2, Decimal.ROUND_CEIL)) : d(0);
  const requiredTotal = Decimal.max(target, minTotalForBestDay);
  const remaining = Decimal.max(requiredTotal.sub(total), 0);
  const needValid = Math.max(0, Math.trunc(i.minDays) - validDays);

  let daysLeft = Math.max(needValid, remaining.gt(0) ? 1 : 0);
  let perDay = d(0);
  let projectedTotal = total;
  for (; daysLeft > 0 && daysLeft <= 365; daysLeft++) {
    perDay = remaining.div(daysLeft).toDecimalPlaces(0, Decimal.ROUND_CEIL);
    if (needValid > 0) perDay = Decimal.max(perDay, minDay.toDecimalPlaces(0, Decimal.ROUND_CEIL));
    projectedTotal = total.add(perDay.mul(daysLeft));
    if (passes(Decimal.max(bestDay, perDay), projectedTotal)) break;
  }
  const projectedBest = Decimal.max(bestDay, perDay);
  const okNow = passes(bestDay, total);
  return {
    total,
    bestDay,
    pct: total.gt(0) && bestDay.gt(0) ? bestDay.div(total).mul(100) : null,
    okNow,
    validDays,
    minTotalForBestDay,
    requiredTotal,
    targetRaised: minTotalForBestDay.gt(target),
    remaining,
    daysLeft,
    perDay,
    projectedTotal,
    projectedPct: projectedTotal.gt(0) && projectedBest.gt(0) ? projectedBest.div(projectedTotal).mul(100) : null,
    maxDay: projectedTotal.mul(limit),
    done: daysLeft === 0 && okNow && total.gte(target),
  };
}
