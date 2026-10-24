import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { d } from "../src/domain/money";
import { allocateReceipt, estimatePayoutNet, summarize, validateLedger } from "../src/domain/roi";
import type { Expense, Ledger, Payout, Receipt } from "../src/domain/types";

const usd = (x: { usd: unknown }) => (x.usd as ReturnType<typeof d>).toFixed(2);
const clp = (x: { clp: unknown }) => (x.clp as ReturnType<typeof d>).toFixed(0);
const p2 = (x: ReturnType<typeof d> | null) => x?.toFixed(2) ?? null;

// ---------------------------------------------------------------------------
// Ejemplo del plan (§4.2–4.4). Tipos de cambio: costos a 900, recibos a 950.
// ---------------------------------------------------------------------------
let n = 0;
const cost = (amount: string, extra: Partial<Expense> = {}): Expense => ({
  id: `e${++n}`, kind: "cost", status: "paid", occurredOn: "2026-09-01",
  category: "evaluacion", amount, currency: "USD", fxUsdClp: "900", ...extra,
});

function planLedger(): Ledger {
  n = 0;
  const bEval = cost("99", { firmId: "B" });
  const expenses: Expense[] = [
    cost("150", { firmId: "A" }), cost("150", { firmId: "A" }), cost("150", { firmId: "A" }),
    cost("130", { firmId: "A", category: "activacion" }),
    cost("80", { firmId: "A", category: "reset" }), cost("80", { firmId: "A", category: "reset" }),
    cost("40", { firmId: "A", category: "datos_mercado" }),
    bEval, cost("99", { firmId: "B" }),
    { ...cost("99", { firmId: "B" }), id: "refB", kind: "refund", refundOfId: bEval.id },
    cost("120", { category: "plataforma" }), // compartido, sin empresa
  ];
  const payouts: Payout[] = [
    { id: "A1", firmId: "A", accountId: "a1", status: "paid", requestedOn: "2026-10-01", requestedAmount: "2000", traderSharePct: "90", currency: "USD" },
    { id: "B1", firmId: "B", accountId: "b1", status: "paid", requestedOn: "2026-10-01", requestedAmount: "1000", traderSharePct: "80", currency: "USD" },
    { id: "A2", firmId: "A", accountId: "a2", status: "requested", requestedOn: "2026-10-10", requestedAmount: "1000", traderSharePct: "90", currency: "USD" },
  ];
  const receipts: Receipt[] = [
    { id: "r1", receivedOn: "2026-10-03", amount: "1780", currency: "USD", fxUsdClp: "950", allocations: [{ payoutId: "A1" }] },
    { id: "r2", receivedOn: "2026-10-03", amount: "785", currency: "USD", fxUsdClp: "950", allocations: [{ payoutId: "B1" }] },
  ];
  // Impuesto inventado SOLO para el ejemplo (no es una tasa chilena).
  const taxes = [{ id: "t1", paidOn: "2027-04-30", taxYear: 2027, amount: "250", currency: "USD" as const, fxUsdClp: "950" }];
  return { expenses, payouts, receipts, taxes };
}

describe("Ejemplo del plan", () => {
  const l = planLedger();
  const s = summarize(l);

  it("no tiene problemas de validación", () => expect(validateLedger(l)).toEqual([]));
  it("C = 999 (con reembolso, sin impuestos)", () => expect(usd(s.C)).toBe("999.00"));
  it("R = 2.565 (payout solicitado NO cuenta)", () => expect(usd(s.R)).toBe("2565.00"));
  it("B = 1.566 y ROI 156,76 %", () => {
    expect(usd(s.B)).toBe("1566.00");
    expect(p2(s.roiPrePct.usd)).toBe("156.76");
  });
  it("N = 1.316 y ROI neto 131,73 %", () => {
    expect(usd(s.N)).toBe("1316.00");
    expect(p2(s.roiNetPct.usd)).toBe("131.73");
  });
  it("capital recuperado 999 y recuperación 256,76 %", () => {
    expect(usd(s.recovered)).toBe("999.00");
    expect(p2(s.recoveryPct.usd)).toBe("256.76");
  });
  it("por cobrar = 90 % de 1.000 = 900", () => expect(s.receivableUsd.toFixed(2)).toBe("900.00"));
  it("ROI CLP 171,02 % (efecto cambiario)", () => {
    expect(clp(s.C)).toBe("899100");
    expect(clp(s.R)).toBe("2436750");
    expect(p2(s.roiPrePct.clp)).toBe("171.02");
  });
  it("el reparto y las comisiones NO se restan dos veces (113,21 % sería el error)", () =>
    expect(p2(s.roiPrePct.usd)).not.toBe("113.21"));

  it("por empresa: A 128,21 %, B 692,93 %, sin impuestos", () => {
    const a = summarize(l, { firmId: "A" });
    const b = summarize(l, { firmId: "B" });
    expect(p2(a.roiPrePct.usd)).toBe("128.21");
    expect(p2(b.roiPrePct.usd)).toBe("692.93");
    expect(a.taxesIncluded).toBe(false);
    // Control: empresas − costo no asignado = global
    expect(a.B.usd.add(b.B.usd).sub(120).toFixed(2)).toBe("1566.00");
  });
});

describe("Reglas de borde", () => {
  it("ROI es null si no hay costos", () => {
    expect(summarize({ expenses: [], payouts: [], receipts: [], taxes: [] }).roiPrePct.usd).toBeNull();
  });

  it("gastos fallidos, anulados o pendientes no cuentan", () => {
    n = 0;
    const s = summarize({
      expenses: [cost("100"), cost("100", { status: "failed" }), cost("100", { status: "void" }), cost("100", { status: "pending" })],
      payouts: [], receipts: [], taxes: [],
    });
    expect(usd(s.C)).toBe("100.00");
  });

  it("detecta referencia de orden duplicada", () => {
    n = 0;
    const issues = validateLedger({
      expenses: [cost("100", { firmId: "L", externalRef: "123" }), cost("100", { firmId: "L", externalRef: "123" })],
      payouts: [], receipts: [], taxes: [],
    });
    expect(issues).toHaveLength(1);
  });

  it("rechaza dinero recibido en un payout no pagado", () => {
    const l = planLedger();
    l.receipts.push({ id: "rx", receivedOn: "2026-10-12", amount: "900", currency: "USD", fxUsdClp: "950", allocations: [{ payoutId: "A2" }] });
    expect(validateLedger(l).some((i) => i.ref === "rx")).toBe(true);
    expect(usd(summarize(l).R)).toBe("2565.00"); // y no lo suma
  });

  it("stablecoin con tasa distinta de 1", () => {
    const s = summarize({
      expenses: [cost("100")],
      payouts: [{ id: "p", firmId: "X", accountId: "x", status: "paid", requestedOn: "2026-10-01", requestedAmount: "200", traderSharePct: "100", currency: "USD" }],
      receipts: [{ id: "r", receivedOn: "2026-10-02", amount: "200", currency: "USDT", usdRate: "0.999", fxUsdClp: "950", allocations: [{ payoutId: "p" }] }],
      taxes: [],
    });
    expect(usd(s.R)).toBe("199.80");
  });
});

// ---------------------------------------------------------------------------
// Datos reales de Lucid (screenshots del 24-10-2026)
// Tipo de cambio 950 = MARCADOR DE PRUEBA, no el real de cada fecha.
// ---------------------------------------------------------------------------
function readCsv(file: string): Record<string, string>[] {
  const [head, ...rows] = readFileSync(join(__dirname, "fixtures", file), "utf8").trim().split("\n");
  const keys = head.split(",");
  return rows.map((r) => Object.fromEntries(r.split(",").map((v, i) => [keys[i], v])));
}

describe("Lucid — datos reales", () => {
  const orders = readCsv("lucid_orders_2026-10-24.csv");
  const pays = readCsv("lucid_payouts_2026-10-24.csv");

  const expenses: Expense[] = orders.map((o) => ({
    id: `o${o.external_ref}`, kind: "cost", status: o.status === "pagado" ? "paid" : "failed",
    occurredOn: o.occurred_on, firmId: "lucid", category: "evaluacion", externalRef: o.external_ref,
    amount: o.amount, currency: "USD", fxUsdClp: "950",
  }));
  const payouts: Payout[] = pays.map((p, i) => ({
    id: `lp${i}`, firmId: "lucid", accountId: p.account_external_id, status: "paid",
    requestedOn: p.requested_on, requestedAmount: p.approved_amount, traderSharePct: "90", currency: "USD",
  }));
  // Único recibo confirmado: los dos retiros de 2.000 del 22-10 llegaron como 3.577.
  const oct22 = payouts.filter((p) => p.requestedOn === "2026-10-22");
  const receipts: Receipt[] = [{
    id: "w1", receivedOn: "2026-10-22", amount: "3577", currency: "USDT", fxUsdClp: "950",
    allocations: oct22.map((p) => ({ payoutId: p.id })),
  }];
  const l: Ledger = { expenses, payouts, receipts, taxes: [] };
  const s = summarize(l);

  it("57 órdenes leídas, 7 fallidas fuera de costos → C = 5.032,40", () => {
    expect(orders).toHaveLength(57);
    expect(expenses.filter((e) => e.status === "failed")).toHaveLength(7);
    expect(usd(s.C)).toBe("5032.40");
  });
  it("sin duplicados ni errores", () => expect(validateLedger(l)).toEqual([]));
  it("12 payouts suman 15.046,14 brutos; neto estimado 13.541,53 tras el 10 %", () => {
    const gross = payouts.reduce((t, p) => t.add(d(p.requestedAmount)), d(0));
    const net = payouts.reduce((t, p) => t.add(estimatePayoutNet(p)), d(0));
    expect(gross.toFixed(2)).toBe("15046.14");
    expect(net.toFixed(2)).toBe("13541.53");
  });
  it("retiro 4.000 → estimado 3.600 → recibido 3.577, repartido 1.788,50 + 1.788,50", () => {
    expect(oct22.reduce((t, p) => t.add(estimatePayoutNet(p)), d(0)).toFixed(2)).toBe("3600.00");
    const alloc = allocateReceipt(receipts[0], new Map(payouts.map((p) => [p.id, p])));
    expect([...alloc.values()].map((v) => v.toFixed(2))).toEqual(["1788.50", "1788.50"]);
    expect(usd(s.R)).toBe("3577.00");
  });
  it("los 10 payouts sin recibo registrado quedan en 'por cobrar', no en ganancias", () =>
    expect(s.receivableUsd.toFixed(2)).toBe("9941.53"));
});
