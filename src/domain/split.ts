import { d, Decimal } from "./money";

export interface SplitRule {
  defaultTraderSharePct: string; // % después del tramo (o único %)
  splitTierThreshold?: string | null; // monto retirado acumulado en la empresa
  splitTierPctBefore?: string | null; // % hasta alcanzar el umbral
}

export interface SplitSuggestion {
  pct: Decimal; // % efectivo para este payout (6 decimales)
  traderAmount: Decimal; // retiro × % (antes de comisiones)
  crossesThreshold: boolean;
  explanation: string;
}

/**
 * % sugerido para un payout según la regla de la empresa y lo ya retirado en ella.
 * Si el payout cruza el umbral, la parte anterior usa el % del tramo y el resto el % normal.
 * Ej. Apex (100 % hasta 25.000, luego 90 %), retirado 24.000, retiro 2.000 → 1.000 + 900 = 1.900 (95 %).
 * "Retirado" = suma de retiros brutos de payouts pagados en esa empresa.
 */
export function suggestTraderShare(rule: SplitRule, withdrawnBefore: string, requested: string): SplitSuggestion {
  const req = d(requested);
  if (req.lte(0)) throw new Error("El retiro debe ser mayor que cero");
  const after = d(rule.defaultTraderSharePct);

  if (!rule.splitTierThreshold || !rule.splitTierPctBefore) {
    return { pct: after, traderAmount: req.mul(after).div(100), crossesThreshold: false, explanation: `${after.toString()} % fijo` };
  }

  const before = d(rule.splitTierPctBefore);
  const remaining = Decimal.max(d(0), d(rule.splitTierThreshold).sub(d(withdrawnBefore)));
  const inTier = Decimal.min(req, remaining);
  const outTier = req.sub(inTier);
  const amount = inTier.mul(before).div(100).add(outTier.mul(after).div(100));
  const pct = amount.div(req).mul(100).toDecimalPlaces(6);
  const crosses = inTier.gt(0) && outTier.gt(0);

  const explanation = inTier.isZero()
    ? `Umbral superado: ${after.toString()} %`
    : outTier.isZero()
      ? `Dentro del tramo: ${before.toString()} % (quedan ${remaining.sub(req).toFixed(2)} hasta el umbral)`
      : `Cruza el umbral: ${inTier.toFixed(2)} al ${before.toString()} % + ${outTier.toFixed(2)} al ${after.toString()} %`;

  return { pct, traderAmount: amount, crossesThreshold: crosses, explanation };
}
