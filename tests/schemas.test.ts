import { describe, expect, it } from "vitest";
import { accountSchema, firmSchema, parseDecimalInput } from "../src/domain/schemas";

describe("números escritos a mano", () => {
  it.each([
    ["25", "25"], ["25.000", "25000"], ["1.234,56", "1234.56"], ["1,234.56", "1234.56"], ["105,20", "105.20"],
    ["105.20", "105.20"], ["US$ 2.000", "2000"], ["90 %", "90"], ["0.500", "0.500"], ["", null], ["abc", "NaN"],
  ])("%s → %s", (input, out) => expect(parseDecimalInput(input)).toBe(out));
});

const firmBase = { name: "Apex", default_trader_share_pct: "90", default_transfer_fee: "25", is_active: "on" };

describe("formulario de empresa", () => {
  it("regla escalonada completa", () => {
    const r = firmSchema.safeParse({ ...firmBase, has_tier: "on", split_tier_threshold: "25.000", split_tier_pct_before: "100" });
    expect(r.success && r.data.split_tier_threshold).toBe("25000");
  });
  it("tramo incompleto da error en el umbral", () => {
    const r = firmSchema.safeParse({ ...firmBase, has_tier: "on", split_tier_pct_before: "100" });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0].path[0]).toBe("split_tier_threshold");
  });
  it("sin tramo se borran sus valores", () => {
    const r = firmSchema.safeParse({ ...firmBase, split_tier_threshold: "1000", split_tier_pct_before: "100" });
    expect(r.success && r.data.split_tier_threshold).toBeNull();
  });
  it("porcentaje sobre 100 es inválido", () => expect(firmSchema.safeParse({ ...firmBase, default_trader_share_pct: "120" }).success).toBe(false));
});

describe("formulario de cuenta", () => {
  const base = { firm_id: "0b9a2c55-6f1e-4c2b-9d0a-3f1e2a4b5c6d", label: "PRO008", phase: "financiada", status: "activa" };
  it("válida con lo mínimo", () => expect(accountSchema.safeParse(base).success).toBe(true));
  it("cuenta perdida exige fecha de cierre", () => {
    const r = accountSchema.safeParse({ ...base, status: "perdida" });
    expect(!r.success && r.error.issues[0].path[0]).toBe("closed_on");
  });
  it("cierre anterior a la apertura es inválido", () =>
    expect(accountSchema.safeParse({ ...base, opened_on: "2026-10-10", closed_on: "2026-10-01" }).success).toBe(false));
});

import { expenseSchema } from "../src/domain/schemas";

describe("formulario de gasto", () => {
  const base = { kind: "cost", status: "paid", occurred_on: "2026-10-15", category: "evaluacion", amount: "105,20", currency: "USD", fx_usd_clp: "945,30" };
  it("normaliza montos chilenos", () => {
    const r = expenseSchema.safeParse(base);
    expect(r.success && r.data.data.amount).toBe("105.20");
    expect(r.success && r.data.data.fx_usd_clp).toBe("945.30");
    expect(r.success && r.data.data.usd_rate).toBeNull();
  });
  it("stablecoin sin tasa → 1", () => {
    const r = expenseSchema.safeParse({ ...base, currency: "USDT" });
    expect(r.success && r.data.data.usd_rate).toBe("1");
  });
  it("reembolso exige gasto original", () => {
    const r = expenseSchema.safeParse({ ...base, kind: "refund" });
    expect(!r.success && r.error.issues[0].path[0]).toBe("refund_of_id");
  });
  it("cuenta sin empresa es inválido", () => {
    expect(expenseSchema.safeParse({ ...base, account_id: "0b9a2c55-6f1e-4c2b-9d0a-3f1e2a4b5c6d" }).success).toBe(false);
  });
  it("monto cero o sin dólar es inválido", () => {
    expect(expenseSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...base, fx_usd_clp: "" }).success).toBe(false);
  });
});
