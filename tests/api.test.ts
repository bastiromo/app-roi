/**
 * Pruebas de la API (PostgREST) con las MISMAS consultas que usa la app (src/lib/queries.ts).
 * Detectan errores que las pruebas de SQL no ven: relaciones para incluir datos (embeds),
 * permisos de funciones RPC y columnas inexistentes.
 * Se ejecutan en CI con un PostgREST real; localmente se omiten si no hay POSTGREST_URL.
 */
import { createHmac } from "node:crypto";
import { PostgrestClient } from "@supabase/postgrest-js";
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPreview, revertBatch, runImport } from "../src/lib/import";
import { Q } from "../src/lib/queries";

const URL = process.env.POSTGREST_URL;
const SECRET = process.env.POSTGREST_JWT_SECRET ?? "";
const USER = "11111111-1111-1111-1111-111111111111";

function jwt(sub: string) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ role: "authenticated", sub, aal: "aal2", exp: Math.floor(Date.now() / 1000) + 3600 });
  const sig = createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

describe.skipIf(!URL)("API: consultas de la app", () => {
  const db = new PostgrestClient(URL ?? "http://localhost", { headers: { Authorization: `Bearer ${jwt(USER)}` } });
  let firmId = "";
  let evalId = "";
  let fundedId = "";
  let payoutId = "";

  beforeAll(async () => {
    const { data: f, error: fe } = await db.from("firms").select("id").eq("name", "Lucid Trading").single();
    expect(fe).toBeNull();
    firmId = f!.id;
    const { data: a, error: ae } = await db
      .from("accounts")
      .insert({ firm_id: firmId, label: "TEST-API", phase: "evaluacion", opened_on: "2026-10-01" })
      .select("id")
      .single();
    expect(ae).toBeNull();
    evalId = a!.id;
  });

  it("empresas, cuentas e historial", async () => {
    for (const [table, cols] of [
      ["firms", Q.firms],
      ["firms", Q.firmsForPayout],
      ["accounts", Q.accounts],
      ["account_status_history", Q.statusHistory],
    ] as const) {
      const { error } = await db.from(table).select(cols).limit(5);
      expect(error, `${table}: ${cols}`).toBeNull();
    }
  });

  it("aprobar evaluación (RPC)", async () => {
    const { data, error } = await db.rpc("approve_evaluation", {
      p_evaluation_id: evalId,
      p_label: "PRO-API",
      p_external_id: "",
      p_approved_on: "2026-10-10",
    });
    expect(error).toBeNull();
    fundedId = data as string;
  });

  it("gastos: insertar en lote y leer con empresa y cuenta", async () => {
    const rows = [1, 2].map((i) => ({
      occurred_on: "2026-10-01", firm_id: firmId, account_id: evalId, category: "evaluacion",
      amount: "105.20", currency: "USD", fx_usd_clp: "950", external_ref: `API-${i}`, source: "test",
    }));
    expect((await db.from("expenses").insert(rows)).error).toBeNull();
    const { data, error } = await db.from("expenses").select(Q.expenses).eq("firm_id", firmId);
    expect(error).toBeNull();
    expect(data!.length).toBe(2);
    expect((data![0] as unknown as { firms: { name: string } }).firms.name).toBe("Lucid Trading");
    expect((await db.from("expenses").select(Q.refundableCosts).limit(5)).error).toBeNull();
  });

  it("payouts: guardar con recibo estimado (RPC) y leer con empresa, cuenta y recibido", async () => {
    const { data, error } = await db.rpc("save_payout", {
      p_id: null, p_firm_id: firmId, p_account_id: fundedId, p_status: "paid", p_requested_on: "2026-10-20",
      p_paid_on: "2026-10-20", p_requested_amount: "2000", p_trader_share_pct: "90", p_firm_fee_amount: "0",
      p_currency: "USD", p_notes: null, p_receipt_mode: "estimated", p_received_amount: "1775.00",
      p_received_currency: "USD", p_received_on: "2026-10-20", p_usd_rate: null, p_fx_usd_clp: "950",
      p_fx_source: "dolar_observado", p_processor_fee: "25", p_tx_hash: null,
    });
    expect(error).toBeNull();
    payoutId = data as string;

    const list = await db.from("payouts").select(Q.payouts).is("deleted_at", null);
    expect(list.error).toBeNull();
    const row = list.data!.find((p) => (p as unknown as { id: string }).id === payoutId) as unknown as {
      firms: { name: string };
      accounts: { label: string };
    };
    expect(row.firms.name).toBe("Lucid Trading");
    expect(row.accounts.label).toBe("PRO-API");

    const flows = await db.from("cash_flows").select(Q.flowsByPayout).eq("flow_type", "payout_recibido").in("payout_id", [payoutId]);
    expect(flows.error).toBeNull();
    expect(flows.data!.length).toBe(1);
    expect(Number((flows.data![0] as unknown as { amount_usd: string }).amount_usd)).toBe(1775);

    const rec = await db.from("receipt_allocations").select(Q.payoutReceipt).eq("payout_id", payoutId);
    expect(rec.error).toBeNull();
    expect((await db.from("payouts").select(Q.paidPayouts).eq("status", "paid")).error).toBeNull();
  });

  it("resumen: vista de flujos", async () => {
    const { data, error } = await db.from("cash_flows").select(Q.flowsSummary);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(3);
  });

  it("eliminar y restaurar (RPC)", async () => {
    expect((await db.rpc("delete_payouts", { p_ids: [payoutId] })).error).toBeNull();
    expect((await db.rpc("restore_payouts", { p_ids: [payoutId] })).error).toBeNull();
    const blocked = await db.rpc("delete_accounts", { p_ids: [fundedId] });
    expect(blocked.error?.message).toMatch(/gastos o payouts/);
  });

  it("caché de dólar observado", async () => {
    const { error } = await db
      .from("fx_rates")
      .upsert({ rate_date: "2026-10-20", usd_clp: "950.00", source: "dolar_observado" }, { onConflict: "user_id,rate_date,source", ignoreDuplicates: true });
    expect(error).toBeNull();
  });

  describe("importar historial real de Lucid", () => {
    const fx = async () => ({ rate: "950" });
    const csv = (f: string) => readFileSync(join(__dirname, "fixtures", f), "utf8");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = db as any;

    it("órdenes: vista previa, importación y reimportación sin duplicar", async () => {
      const pre = await buildPreview(client, fx, csv("lucid_orders_2026-10-24.csv"), null);
      expect(pre.kind).toBe("expenses");
      expect(pre.counts).toEqual({ new: 57, duplicate: 0, error: 0 });
      expect(pre.totalUsd).toMatch(/5\.032,40/);
      const r = await runImport(client, fx, csv("lucid_orders_2026-10-24.csv"), null, new Date("2026-10-24T08:00:00Z"));
      expect(r.ok, r.message).toBe(true);
      const again = await buildPreview(client, fx, csv("lucid_orders_2026-10-24.csv"), null);
      expect(again.counts).toEqual({ new: 0, duplicate: 57, error: 0 });
    });

    it("payouts: crea 7 cuentas, recibido estimado 13.241,53 (90 % − 25) y se puede deshacer", async () => {
      const pre = await buildPreview(client, fx, csv("lucid_payouts_2026-10-24.csv"), null);
      expect(pre.counts).toEqual({ new: 12, duplicate: 0, error: 0 });
      expect(pre.newAccounts).toHaveLength(7);
      expect(pre.totalUsd).toMatch(/13\.241,53/);
      const r = await runImport(client, fx, csv("lucid_payouts_2026-10-24.csv"), null, new Date("2026-10-24T08:01:00Z"));
      expect(r.ok, r.message).toBe(true);

      const ids = ((await db.from("payouts").select("id").eq("source", r.batch!)).data ?? []).map((p) => p.id as string);
      expect(ids).toHaveLength(12);
      const flows = await db.from("cash_flows").select(Q.flowsByPayout).in("payout_id", ids);
      const sum = (flows.data ?? []).reduce((t, f) => t + Math.round(Number((f as unknown as { amount_usd: string }).amount_usd) * 100), 0);
      expect(sum / 100).toBe(13241.53);

      const again = await buildPreview(client, fx, csv("lucid_payouts_2026-10-24.csv"), null);
      expect(again.counts.duplicate).toBe(12);

      await revertBatch(client, r.batch!);
      const left = await db.from("payouts").select("id").eq("source", r.batch!).is("deleted_at", null);
      expect(left.data).toHaveLength(0);
      const accs = await db.from("accounts").select("id").like("notes", `%${r.batch}%`).is("deleted_at", null);
      expect(accs.data).toHaveLength(0);
    });
  });
});
