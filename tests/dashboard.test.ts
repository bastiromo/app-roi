import { describe, expect, it } from "vitest";
import { byFirm, monthlySeries } from "../src/domain/dashboard";
import type { FlowRow } from "../src/domain/flows";
import { d } from "../src/domain/money";

const f = (flow_type: FlowRow["flow_type"], usd: string, flow_date: string, firm_id: string | null, is_estimated = false) => ({
  flow_type, direction: flow_type === "costo" || flow_type === "impuesto" ? -1 : 1, firm_id, amount_usd: usd, amount_clp: "0", is_estimated, flow_date,
});

const rows = [
  f("costo", "150", "2026-07-03", "A"),
  f("costo", "99", "2026-07-20", "B"),
  f("reembolso", "99", "2026-09-01", "B"),
  f("costo", "120", "2026-09-05", null),
  f("payout_recibido", "1780", "2026-09-29", "A", true),
  f("payout_recibido", "785", "2026-10-03", "B"),
  f("impuesto", "250", "2026-10-30", null),
];

describe("serie mensual", () => {
  const s = monthlySeries(rows);
  it("meses continuos, incluido agosto vacío", () => expect(s.map((p) => p.month)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]));
  it("reembolso resta costos; impuestos fuera", () => {
    expect(s[0].costs.toString()).toBe("249");
    expect(s[2].costs.toString()).toBe("21"); // 120 − 99
    expect(s[3].costs.toString()).toBe("0");
  });
  it("acumulado termina en el beneficio total (2.565 − 270 = 2.295)", () => {
    expect(s.map((p) => p.cumulative.toString())).toEqual(["-249", "-249", "1510", "2295"]);
  });
  it("vacío → []", () => expect(monthlySeries([])).toEqual([]));
});

describe("por empresa", () => {
  const firms = [{ id: "A", name: "Lucid" }, { id: "B", name: "Topstep" }, { id: "C", name: "Apex" }];
  const r = byFirm(rows, firms, new Map([["A", d(900)], ["C", d(1800)]]));
  it("Lucid: ROI 1.086,67 %, con estimado y por cobrar", () => {
    const a = r.find((x) => x.firmId === "A")!;
    expect(a.profit.toString()).toBe("1630");
    expect(a.roiPct!.toFixed(2)).toBe("1086.67");
    expect(a.receivedEstimated.toString()).toBe("1780");
    expect(a.pending.toString()).toBe("900");
  });
  it("Topstep: costo neto 0 → ROI null", () => expect(r.find((x) => x.firmId === "B")!.roiPct).toBeNull());
  it("empresa solo con por cobrar aparece", () => expect(r.find((x) => x.firmId === "C")!.pending.toString()).toBe("1800"));
  it("orden: beneficio desc, General al final", () => {
    expect(r.map((x) => x.firmId)).toEqual(["A", "B", "C", null]);
  });
  it("suma por empresa = beneficio global sin impuestos", () =>
    expect(r.reduce((t, x) => t.add(x.profit), d(0)).toString()).toBe("2295"));
});
