import { describe, expect, it } from "vitest";
import { APEX_50K, simulate } from "../src/domain/simulator";

const sim = (o: Partial<typeof APEX_50K>) => simulate({ ...APEX_50K, ...o });

describe("simulador de packs", () => {
  it("2 packs, 5 aprobadas, 1 cobra: inversión 685, beneficio 815, ROI 118,98 %", () => {
    const r = sim({});
    expect(r.evaluations).toBe(10);
    expect(r.packCost.toString()).toBe("190");
    expect(r.activationCost.toString()).toBe("495");
    expect(r.investment.toString()).toBe("685");
    expect(r.gross.toString()).toBe("1500");
    expect(r.profit.toString()).toBe("815");
    expect(r.roiPct!.toFixed(2)).toBe("118.98");
    expect(r.breakEven).toBe(1);
  });
  it("10 aprobadas, 1 cobra: inversión 1.180, beneficio 320, ROI 27,1 % (ejemplo de la captura)", () => {
    const r = sim({ approved: 10 });
    expect(r.investment.toString()).toBe("1180");
    expect(r.profit.toString()).toBe("320");
    expect(r.roiPct!.toFixed(1)).toBe("27.1");
  });
  it("nadie cobra: se pierde toda la inversión (ROI −100 %)", () => {
    const r = sim({ withdrawing: 0 });
    expect(r.profit.toString()).toBe("-685");
    expect(r.roiPct!.toString()).toBe("-100");
  });
  it("los seis retiros de una cuenta suman 14.500", () => {
    const r = sim({ payoutsPerAccount: 6 });
    expect(r.perAccount.toString()).toBe("14500");
    expect(r.profit.toString()).toBe("13815");
  });
  it("límites: no se aprueban más de las compradas ni cobran más de las aprobadas", () => {
    const r = sim({ packs: 1, approved: 9, withdrawing: 9 });
    expect([r.evaluations, r.approved, r.withdrawing]).toEqual([5, 5, 5]);
  });
  it("punto de equilibrio: 4 packs y 20 aprobadas necesitan 2 cuentas cobrando", () => {
    const r = sim({ packs: 4, approved: 20 }); // 380 + 1.980 = 2.360
    expect(r.investment.toString()).toBe("2360");
    expect(r.breakEven).toBe(2);
  });
  it("sin packs: sin inversión y ROI indefinido", () => {
    const r = sim({ packs: 0 });
    expect(r.investment.toString()).toBe("0");
    expect(r.roiPct).toBeNull();
  });
});
