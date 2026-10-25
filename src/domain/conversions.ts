import { d, type Decimal } from "./money";

/** Una venta de cripto por pesos, tal como se guarda (montos como texto exacto). */
export interface ConversionRow {
  from_amount: string; // USDT/USDC entregados al comprador
  to_amount: string; // CLP recibidos en tu cuenta
  fee_amount: string; // comisión (0 si no hubo)
  fee_currency: string | null; // "CLP" o la cripto vendida
  ref_usd_clp: string | null; // dólar observado del día (null si no se pudo obtener)
}

export interface ConversionResult {
  /** Cripto que salió de tu billetera (vendida + comisión cobrada en cripto). */
  cryptoOut: Decimal;
  /** Pesos que quedaron para ti (recibidos − comisión cobrada en pesos). */
  clpNet: Decimal;
  /** Precio efectivo: pesos netos por cada USDT que salió. */
  price: Decimal;
  /** Lo que valían esos USDT al dólar observado (USDT ≈ 1 USD). null sin referencia. */
  reference: Decimal | null;
  /** clpNet − reference: positivo = vendiste por sobre el dólar observado. */
  difference: Decimal | null;
}

export function conversionResult(r: ConversionRow): ConversionResult {
  const fee = d(r.fee_amount || "0");
  const feeInClp = r.fee_currency === "CLP";
  const cryptoOut = d(r.from_amount).add(feeInClp ? 0 : fee);
  const clpNet = d(r.to_amount).sub(feeInClp ? fee : 0);
  const reference = r.ref_usd_clp ? cryptoOut.mul(d(r.ref_usd_clp)) : null;
  return {
    cryptoOut,
    clpNet,
    price: clpNet.div(cryptoOut),
    reference,
    difference: reference ? clpNet.sub(reference) : null,
  };
}

export interface ConversionSummary {
  count: number;
  cryptoOut: Decimal;
  clpNet: Decimal;
  /** Precio promedio ponderado (pesos netos / USDT que salieron). null sin ventas. */
  avgPrice: Decimal | null;
  /** Solo ventas con dólar observado disponible. */
  compared: { count: number; reference: Decimal; difference: Decimal; avgRef: Decimal | null };
}

export function summarizeConversions(rows: ConversionRow[]): ConversionSummary {
  let cryptoOut = d(0);
  let clpNet = d(0);
  let refCount = 0;
  let refCrypto = d(0);
  let reference = d(0);
  let difference = d(0);
  for (const row of rows) {
    const r = conversionResult(row);
    cryptoOut = cryptoOut.add(r.cryptoOut);
    clpNet = clpNet.add(r.clpNet);
    if (r.reference && r.difference) {
      refCount++;
      refCrypto = refCrypto.add(r.cryptoOut);
      reference = reference.add(r.reference);
      difference = difference.add(r.difference);
    }
  }
  return {
    count: rows.length,
    cryptoOut,
    clpNet,
    avgPrice: cryptoOut.isZero() ? null : clpNet.div(cryptoOut),
    compared: { count: refCount, reference, difference, avgRef: refCrypto.isZero() ? null : reference.div(refCrypto) },
  };
}
