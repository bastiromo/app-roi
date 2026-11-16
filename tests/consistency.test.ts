import { describe, expect, it } from "vitest";
import { consistencyPlan, type ConsistencyInput } from "../src/domain/consistency";

const apex: ConsistencyInput = { limitPct: "50", strict: true, target: "2000", minDays: 5, minDay: "200", days: [] };
const plan = (o: Partial<ConsistencyInput>) => consistencyPlan({ ...apex, ...o });

describe("calculadora de consistencia", () => {
  it("Apex ciclo 2 desde cero: 5 días de 400, consistencia 20 %, tope por día 1.000", () => {
    const r = plan({});
    expect([r.daysLeft, r.perDay.toString(), r.projectedTotal.toString()]).toEqual([5, "400", "2000"]);
    expect(r.projectedPct!.toString()).toBe("20");
    expect(r.maxDay.toString()).toBe("1000");
    expect(r.done).toBe(false);
  });
  it("un día de 1.500 obliga a ganar más de 3.000 en el ciclo (50 % estricto)", () => {
    const r = plan({ days: ["1500"] });
    expect(r.okNow).toBe(false);
    expect(r.minTotalForBestDay.toString()).toBe("3000.01");
    expect(r.targetRaised).toBe(true);
    expect(r.remaining.toString()).toBe("1500.01");
    expect([r.daysLeft, r.perDay.toString()]).toEqual([4, "376"]);
    expect(r.projectedPct!.lt(50)).toBe(true);
  });
  it("con límite 40 %, el mismo día de 1.500 exige más de 3.750", () => {
    expect(plan({ limitPct: "40", days: ["1500"] }).minTotalForBestDay.toString()).toBe("3750.01");
  });
  it("si el límite exacto vale (≤), bastan 3.000", () => {
    expect(plan({ strict: false, days: ["1500"] }).minTotalForBestDay.toString()).toBe("3000");
  });
  it("exactamente 50 % no cumple cuando es estricto, y sí cuando no lo es", () => {
    const days = ["1000", "250", "250", "250", "250"];
    expect(plan({ days }).okNow).toBe(false);
    expect(plan({ days, strict: false }).okNow).toBe(true);
  });
  it("sin mínimo de días: 3.000 al 50 % estricto necesita al menos 3 días", () => {
    const r = plan({ target: "3000", minDays: 0 });
    expect([r.daysLeft, r.perDay.toString()]).toEqual([3, "1000"]);
  });
  it("30 %: 3.000 necesita 4 días de 750", () => {
    const r = plan({ limitPct: "30", target: "3000", minDays: 0 });
    expect([r.daysLeft, r.perDay.toString()]).toEqual([4, "750"]);
  });
  it("un día perdedor no cuenta y sube lo que falta", () => {
    const r = plan({ days: ["1500", "-1000"] });
    expect([r.total.toString(), r.validDays, r.remaining.toString(), r.daysLeft, r.perDay.toString()]).toEqual(["500", 1, "2500.01", 4, "626"]);
    expect(r.projectedPct!.lt(50)).toBe(true);
  });
  it("un día de 199 no cuenta como rentable: falta un día más de al menos 200", () => {
    const r = plan({ days: ["500", "500", "500", "500", "199"] });
    expect([r.validDays, r.remaining.toString(), r.daysLeft, r.perDay.toString()]).toEqual([4, "0", 1, "200"]);
  });
  it("ciclo completo: objetivo, 5 días y consistencia cumplidos", () => {
    const r = plan({ days: ["400", "400", "400", "400", "400"] });
    expect([r.done, r.daysLeft, r.pct!.toString()]).toEqual([true, 0, "20"]);
  });
});
