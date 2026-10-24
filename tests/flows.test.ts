import { describe, expect, it } from "vitest";
import { summarizeFlows, type FlowRow } from "../src/domain/flows";

// Filas equivalentes a las que produce la vista cash_flows con el ejemplo del plan.
const row = (flow_type: FlowRow["flow_type"], usd: number, fx: number, firm_id: string | null, is_estimated = false): FlowRow => ({
  flow_type, direction: flow_type === "costo" || flow_type === "impuesto" ? -1 : 1, firm_id,
  amount_usd: String(usd), amount_clp: String(usd * fx), is_estimated,
});

const rows: FlowRow[] = [
  ...[150, 150, 150, 130, 80, 80, 40].map((v) => row("costo", v, 900, "A")),
  row("costo", 99, 900, "B"), row("costo", 99, 900, "B"), row("reembolso", 99, 900, "B"),
  row("costo", 120, 900, null),
  row("payout_recibido", 1780, 950, "A"), row("payout_recibido", 785, 950, "B", true),
  row("impuesto", 250, 950, null),
];

describe("summarizeFlows (vista cash_flows)", () => {
  const s = summarizeFlows(rows);
  it("coincide con el motor: C 999, R 2.565, ROI 156,76 %, neto 131,73 %", () => {
    expect(s.C.toFixed(2)).toBe("999.00");
    expect(s.R.toFixed(2)).toBe("2565.00");
    expect(s.roiPrePct?.toFixed(2)).toBe("156.76");
    expect(s.roiNetPct?.toFixed(2)).toBe("131.73");
  });
  it("informa la parte estimada de R", () => expect(s.REstimated.toFixed(2)).toBe("785.00"));
  it("CLP 171,02 %", () => expect(summarizeFlows(rows, "clp").roiPrePct?.toFixed(2)).toBe("171.02"));
  it("por empresa excluye impuestos: A 128,21 %", () => {
    const a = summarizeFlows(rows, "usd", "A");
    expect(a.roiPrePct?.toFixed(2)).toBe("128.21");
    expect(a.T.toFixed(2)).toBe("0.00");
  });
  it("sin datos → ROI null", () => expect(summarizeFlows([]).roiPrePct).toBeNull());
});
