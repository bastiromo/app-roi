import Decimal from "decimal.js";

// Precisión alta y redondeo bancario estándar solo al presentar.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export type Currency = "USD" | "CLP" | "USDT" | "USDC";

/**
 * Datos de conversión guardados en cada movimiento (nunca se recalculan con el dólar de hoy).
 * - fxUsdClp: pesos chilenos por 1 USD en la fecha del movimiento.
 * - usdRate: USD por 1 unidad de la moneda (solo stablecoins; por defecto 1).
 */
export interface FxSnapshot {
  fxUsdClp: string;
  usdRate?: string;
}

export interface Amount extends FxSnapshot {
  amount: string; // siempre positivo; el signo lo da el tipo de movimiento
  currency: Currency;
}

export interface Dual {
  usd: Decimal;
  clp: Decimal;
}

export const ZERO: Dual = { usd: new Decimal(0), clp: new Decimal(0) };

export function d(value: string | number | Decimal): Decimal {
  return new Decimal(value);
}

/** Convierte un monto a USD y CLP usando el tipo de cambio guardado en ese movimiento. */
export function toDual(a: Amount): Dual {
  const amount = d(a.amount);
  if (amount.isNegative()) throw new Error(`Monto negativo no permitido: ${a.amount}`);
  const fx = d(a.fxUsdClp);
  if (fx.lte(0)) throw new Error(`Tipo de cambio USD/CLP inválido: ${a.fxUsdClp}`);

  switch (a.currency) {
    case "USD":
      return { usd: amount, clp: amount.mul(fx) };
    case "USDT":
    case "USDC": {
      const usd = amount.mul(d(a.usdRate ?? "1"));
      return { usd, clp: usd.mul(fx) };
    }
    case "CLP":
      return { usd: amount.div(fx), clp: amount };
  }
}

export function addDual(a: Dual, b: Dual): Dual {
  return { usd: a.usd.add(b.usd), clp: a.clp.add(b.clp) };
}

export function subDual(a: Dual, b: Dual): Dual {
  return { usd: a.usd.sub(b.usd), clp: a.clp.sub(b.clp) };
}

export function scaleDual(a: Dual, factor: Decimal): Dual {
  return { usd: a.usd.mul(factor), clp: a.clp.mul(factor) };
}

/** Redondeo solo para mostrar: USD a 2 decimales, CLP a 0. */
export function show(x: Dual): { usd: string; clp: string } {
  return { usd: x.usd.toFixed(2), clp: x.clp.toFixed(0) };
}
