import { describe, expect, it } from "vitest";
import { suggestTraderShare } from "../src/domain/split";

const apex = { defaultTraderSharePct: "90", splitTierThreshold: "25000", splitTierPctBefore: "100" };
const lucid = { defaultTraderSharePct: "90" };

describe("% sugerido por tramos", () => {
  it("Lucid: 90 % fijo → 2.000 da 1.800", () => {
    const s = suggestTraderShare(lucid, "50000", "2000");
    expect(s.pct.toFixed(2)).toBe("90.00");
    expect(s.traderAmount.toFixed(2)).toBe("1800.00");
  });
  it("Apex dentro del tramo: 100 %", () => {
    const s = suggestTraderShare(apex, "10000", "3000");
    expect(s.pct.toFixed(2)).toBe("100.00");
    expect(s.crossesThreshold).toBe(false);
  });
  it("Apex cruzando el umbral: 24.000 retirados + 2.000 → 1.900 (95 %)", () => {
    const s = suggestTraderShare(apex, "24000", "2000");
    expect(s.traderAmount.toFixed(2)).toBe("1900.00");
    expect(s.pct.toFixed(2)).toBe("95.00");
    expect(s.crossesThreshold).toBe(true);
  });
  it("Apex % mezclado no exacto: 24.000 + 3.000 → 2.800 al centavo", () => {
    const s = suggestTraderShare(apex, "24000", "3000");
    expect(s.pct.toString()).toBe("93.333333");
    expect(s.traderAmount.toFixed(2)).toBe("2800.00");
    // Al guardar solo el % (6 decimales), el monto recalculado redondea al mismo centavo
    expect(s.pct.mul(3000).div(100).toFixed(2)).toBe("2800.00");
  });
  it("Apex umbral superado: 90 %", () => {
    expect(suggestTraderShare(apex, "30000", "2000").pct.toFixed(2)).toBe("90.00");
  });
  it("rechaza retiros en cero", () => expect(() => suggestTraderShare(lucid, "0", "0")).toThrow());
});
