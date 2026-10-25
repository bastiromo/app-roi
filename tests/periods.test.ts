import { describe, expect, it } from "vitest";
import type { FlowRow } from "../src/domain/flows";
import { d } from "../src/domain/money";
import { bucketSeries, inWindow, pctChange, periodWindow } from "../src/domain/periods";

type Row = FlowRow & { flow_date: string };
const flow = (flow_date: string, flow_type: FlowRow["flow_type"], usd: number, is_estimated = false): Row => ({
  flow_date, flow_type, direction: flow_type === "costo" || flow_type === "impuesto" ? -1 : 1, firm_id: "A",
  amount_usd: String(usd), amount_clp: String(usd * 950), is_estimated,
});

describe("ventanas de período", () => {
  it("30D: 30 días que terminan hoy y los 30 anteriores", () => {
    expect(periodWindow("30d", "2026-10-25", null)).toEqual({
      from: "2026-09-26", to: "2026-10-25", prevFrom: "2026-08-27", prevTo: "2026-09-25", bucket: "day",
    });
  });
  it("90D: por semanas", () => {
    const w = periodWindow("90d", "2026-10-25", null);
    expect(w.from).toBe("2026-07-28");
    expect(w.prevTo).toBe("2026-07-27");
    expect(w.bucket).toBe("week");
  });
  it("12M: meses calendario (nov 25 – oct 26) y los 12 anteriores", () => {
    expect(periodWindow("12m", "2026-10-25", null)).toEqual({
      from: "2025-11-01", to: "2026-10-25", prevFrom: "2024-11-01", prevTo: "2025-10-31", bucket: "month",
    });
  });
  it("Todo: desde el mes del primer movimiento, sin período anterior", () => {
    const w = periodWindow("todo", "2026-10-25", "2026-03-14");
    expect(w.from).toBe("2026-03-01");
    expect(w.prevFrom).toBeNull();
  });
});

describe("serie por tramos", () => {
  const rows = [
    flow("2026-08-20", "costo", 500), // antes de la ventana: base del acumulado
    flow("2026-09-01", "costo", 150),
    flow("2026-09-03", "reembolso", 50),
    flow("2026-10-02", "payout_recibido", 1775, true),
    flow("2026-10-10", "payout_recibido", 900),
    flow("2026-10-15", "impuesto", 100), // no entra
  ];
  const w = periodWindow("12m", "2026-10-25", null);
  const s = bucketSeries(rows, w);

  it("un punto por mes de la ventana", () => {
    expect(s).toHaveLength(12);
    expect(s[0].start).toBe("2025-11-01");
    expect(s[11]).toMatchObject({ start: "2026-10-01", end: "2026-10-25" });
  });
  it("costos netos de reembolsos y recibido con su parte estimada", () => {
    const sep = s.find((p) => p.start === "2026-09-01")!;
    const oct = s[11];
    expect(sep.costs.toString()).toBe("100");
    expect(oct.received.toString()).toBe("2675");
    expect(oct.receivedEstimated.toString()).toBe("1775");
  });
  it("acumulado parte desde el primer movimiento (incluye lo anterior a la ventana)", () => {
    expect(s[0].cumulative.toString()).toBe("0"); // nov 25: aún sin movimientos
    expect(s.find((p) => p.start === "2026-08-01")!.cumulative.toString()).toBe("-500");
    expect(s[11].cumulative.toString()).toBe("2075"); // 2675 − 600
    // En 30D (desde el 26-09) lo anterior queda como base: −500 − 150 + 50
    expect(bucketSeries(rows, periodWindow("30d", "2026-10-25", null))[0].cumulative.toString()).toBe("-600");
    expect(s[11].cumulativeRoiPct!.toFixed(2)).toBe("345.83");
  });
  it("30D por día: cada movimiento cae en su día", () => {
    const day = bucketSeries(rows, periodWindow("30d", "2026-10-25", null));
    expect(day).toHaveLength(30);
    expect(day.find((p) => p.start === "2026-10-10")!.received.toString()).toBe("900");
  });
  it("90D por semana: tramos de 7 días; el último termina hoy", () => {
    const wk = bucketSeries(rows, periodWindow("90d", "2026-10-25", null));
    expect(wk).toHaveLength(13);
    expect(wk[12].end).toBe("2026-10-25");
    const total = wk.reduce((t, p) => t.add(p.received), d(0));
    expect(total.toString()).toBe("2675");
  });
  it("filtro por ventana", () => {
    expect(inWindow(rows, "2026-10-01", "2026-10-31")).toHaveLength(3);
  });
});

describe("variación", () => {
  it("porcentaje y sin base", () => {
    expect(pctChange(d(150), d(100))!.toString()).toBe("50");
    expect(pctChange(d(-50), d(-100))!.toString()).toBe("50");
    expect(pctChange(d(10), d(0))).toBeNull();
  });
});
