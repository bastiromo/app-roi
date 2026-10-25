import { describe, expect, it } from "vitest";
import { conversionResult, summarizeConversions } from "../src/domain/conversions";

const base = { fee_amount: "0", fee_currency: null };

describe("venta de USDT por pesos", () => {
  it("sin comisión: 1.000 USDT → $955.000 con observado 950 = +$5.000", () => {
    const r = conversionResult({ ...base, from_amount: "1000", to_amount: "955000", ref_usd_clp: "950" });
    expect(r.price.toString()).toBe("955");
    expect(r.reference!.toString()).toBe("950000");
    expect(r.difference!.toString()).toBe("5000");
  });

  it("comisión en USDT: salen 1.002 USDT, el precio efectivo baja", () => {
    const r = conversionResult({ from_amount: "1000", to_amount: "955000", fee_amount: "2", fee_currency: "USDT", ref_usd_clp: "950" });
    expect(r.cryptoOut.toString()).toBe("1002");
    expect(r.price.toFixed(2)).toBe("953.09");
    expect(r.difference!.toString()).toBe("3100"); // 955.000 − 1.002 × 950
  });

  it("comisión en pesos: se resta de lo recibido", () => {
    const r = conversionResult({ from_amount: "500", to_amount: "470000", fee_amount: "1500", fee_currency: "CLP", ref_usd_clp: "950" });
    expect(r.clpNet.toString()).toBe("468500");
    expect(r.difference!.toString()).toBe("-6500");
  });

  it("sin dólar observado: sin comparación", () => {
    const r = conversionResult({ ...base, from_amount: "100", to_amount: "95000", ref_usd_clp: null });
    expect(r.reference).toBeNull();
    expect(r.difference).toBeNull();
  });
});

describe("resumen de ventas", () => {
  it("precio promedio ponderado y comparación solo con referencia", () => {
    const s = summarizeConversions([
      { ...base, from_amount: "1000", to_amount: "955000", ref_usd_clp: "950" },
      { ...base, from_amount: "3000", to_amount: "2820000", ref_usd_clp: "945" },
      { ...base, from_amount: "100", to_amount: "96000", ref_usd_clp: null },
    ]);
    expect(s.count).toBe(3);
    expect(s.cryptoOut.toString()).toBe("4100");
    expect(s.clpNet.toString()).toBe("3871000");
    expect(s.avgPrice!.toFixed(2)).toBe("944.15");
    expect(s.compared.count).toBe(2);
    expect(s.compared.difference.toString()).toBe("-10000"); // +5.000 − 15.000
    expect(s.compared.avgRef!.toFixed(2)).toBe("946.25");
  });
  it("vacío", () => {
    const s = summarizeConversions([]);
    expect(s.avgPrice).toBeNull();
    expect(s.compared.avgRef).toBeNull();
  });
});
