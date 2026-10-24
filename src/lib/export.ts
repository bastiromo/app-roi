/**
 * Exportación de datos: Excel con todas las hojas y CSV de gastos/payouts en el MISMO
 * formato del importador (sirve como respaldo restaurable). Recibe el cliente de base,
 * así que se prueba contra la API real igual que el importador.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { byFirm, monthlySeries } from "@/domain/dashboard";
import { type FlowRow, summarizeFlows } from "@/domain/flows";
import { d, toDual } from "@/domain/money";
import { CATEGORY_LABEL, EXPENSE_STATUS_LABEL, PAYOUT_STATUS_LABEL, PHASE_LABEL, STATUS_LABEL } from "@/domain/schemas";
import { Q } from "@/lib/queries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

interface Firm { id: string; name: string; default_trader_share_pct: string; split_tier_threshold: string | null; split_tier_pct_before: string | null; default_transfer_fee: string; transfer_fee_is_estimate: boolean; is_configured: boolean; is_active: boolean; payout_rules_notes: string | null; notes: string | null }
interface Account { id: string; firm_id: string; label: string; external_id: string | null; plan_name: string | null; nominal_size: string | null; phase: keyof typeof PHASE_LABEL; status: keyof typeof STATUS_LABEL; origin_account_id: string | null; opened_on: string | null; closed_on: string | null; notes: string | null }
interface Expense { id: string; kind: "cost" | "refund"; status: keyof typeof EXPENSE_STATUS_LABEL; occurred_on: string; firm_id: string | null; account_id: string | null; category: string; description: string | null; amount: string; currency: "USD" | "USDT" | "USDC" | "CLP"; usd_rate: string | null; fx_usd_clp: string; external_ref: string | null; tx_hash: string | null }
interface Payout { id: string; firm_id: string; account_id: string; status: keyof typeof PAYOUT_STATUS_LABEL; requested_on: string; paid_on: string | null; requested_amount: string; trader_share_pct: string; currency: string; notes: string | null }
interface Received { payout_id: string; amount_usd: string; is_estimated: boolean }
interface ReceiptRow { payout_id: string; receipts: { basis: string; amount: string; currency: string; received_on: string; deleted_at: string | null } | null }

async function load(db: Db) {
  const [firms, accounts, expenses, payouts, flows, received, receipts] = await Promise.all([
    db.from("firms").select(Q.firms).is("deleted_at", null).order("name").returns<Firm[]>(),
    db.from("accounts").select(Q.accounts).is("deleted_at", null).order("opened_on").returns<Account[]>(),
    db.from("expenses").select(Q.expenses).is("deleted_at", null).order("occurred_on").returns<Expense[]>(),
    db.from("payouts").select(Q.payouts).is("deleted_at", null).order("requested_on").returns<Payout[]>(),
    db.from("cash_flows").select(Q.flowsSummary).returns<(FlowRow & { flow_date: string })[]>(),
    db.from("cash_flows").select(Q.flowsByPayout).eq("flow_type", "payout_recibido").returns<Received[]>(),
    db.from("receipt_allocations").select(`payout_id,${Q.payoutReceipt}`).returns<ReceiptRow[]>(),
  ]);
  for (const r of [firms, accounts, expenses, payouts, flows, received, receipts]) if (r.error) throw new Error(r.error.message);
  return {
    firms: firms.data ?? [],
    accounts: accounts.data ?? [],
    expenses: expenses.data ?? [],
    payouts: payouts.data ?? [],
    flows: flows.data ?? [],
    received: received.data ?? [],
    receipts: (receipts.data ?? []).filter((r) => r.receipts && !r.receipts.deleted_at),
  };
}

const num = (v: string | null | undefined) => (v === null || v === undefined ? null : Number(d(v).toFixed(6)));
const date = (v: string | null) => (v ? new Date(`${v.slice(0, 10)}T12:00:00Z`) : null);
const USD = '"US$"#,##0.00';
const CLP = '"$"#,##0';
const PCT = '0.0"%"';

function sheet(wb: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width?: number; fmt?: string }[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 14, style: c.fmt ? { numFmt: c.fmt } : {} }));
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

export async function buildWorkbook(db: Db, owner: string): Promise<Buffer> {
  const data = await load(db);
  const firmName = new Map(data.firms.map((f) => [f.id, f.name]));
  const accLabel = new Map(data.accounts.map((a) => [a.id, a.label]));
  const wb = new ExcelJS.Workbook();
  wb.creator = "App ROI";
  wb.created = new Date();

  // --- Resumen
  const usd = summarizeFlows(data.flows, "usd");
  const clp = summarizeFlows(data.flows, "clp");
  const rs = wb.addWorksheet("Resumen");
  rs.columns = [{ width: 34 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 18 }];
  rs.addRow([`App ROI — ${owner}`]).font = { bold: true, size: 14 };
  rs.addRow(["Montos en USD salvo indicación. Recibido incluye montos estimados (retiro × % − comisión)."]).font = { italic: true, color: { argb: "FF666666" } };
  rs.addRow([]);
  const kv: [string, number | null, string][] = [
    ["Costos (neto de reembolsos)", num(usd.C.toString()), USD],
    ["Recibido", num(usd.R.toString()), USD],
    ["   de lo cual estimado", num(usd.REstimated.toString()), USD],
    ["Beneficio antes de impuestos", num(usd.B.toString()), USD],
    ["Impuestos pagados", num(usd.T.toString()), USD],
    ["Beneficio neto", num(usd.N.toString()), USD],
    ["ROI antes de impuestos", usd.roiPrePct ? num(usd.roiPrePct.toString()) : null, PCT],
    ["ROI neto", usd.roiNetPct ? num(usd.roiNetPct.toString()) : null, PCT],
    ["Capital recuperado (recibido / costos)", usd.recoveryPct ? num(usd.recoveryPct.toString()) : null, PCT],
    ["Beneficio en pesos (CLP)", num(clp.B.toString()), CLP],
    ["ROI en pesos", clp.roiPrePct ? num(clp.roiPrePct.toString()) : null, PCT],
  ];
  for (const [k, v, f] of kv) {
    const row = rs.addRow([k, v]);
    row.getCell(2).numFmt = f;
  }
  rs.addRow([]);
  rs.addRow(["Por empresa"]).font = { bold: true };
  const fh = rs.addRow(["Empresa", "Costos", "Recibido", "Beneficio", "ROI", "Recibido estimado"]);
  fh.font = { bold: true };
  for (const f of byFirm(data.flows, data.firms)) {
    const row = rs.addRow([f.name, num(f.costs.toString()), num(f.received.toString()), num(f.profit.toString()), f.roiPct ? num(f.roiPct.toString()) : null, num(f.receivedEstimated.toString())]);
    [2, 3, 4, 6].forEach((c) => (row.getCell(c).numFmt = USD));
    row.getCell(5).numFmt = PCT;
  }
  rs.addRow([]);
  rs.addRow(["Mes a mes"]).font = { bold: true };
  rs.addRow(["Mes", "Costos", "Recibido", "Resultado", "", "Acumulado"]).font = { bold: true };
  for (const m of monthlySeries(data.flows)) {
    const row = rs.addRow([m.month, num(m.costs.toString()), num(m.received.toString()), num(m.net.toString()), null, num(m.cumulative.toString())]);
    [2, 3, 4, 6].forEach((c) => (row.getCell(c).numFmt = USD));
  }

  // --- Gastos
  const ge = sheet(wb, "Gastos", [
    { header: "Fecha", key: "date", width: 12, fmt: "dd-mm-yyyy" },
    { header: "Empresa", key: "firm", width: 20 },
    { header: "Cuenta", key: "account", width: 16 },
    { header: "Tipo", key: "kind", width: 11 },
    { header: "Categoría", key: "cat", width: 18 },
    { header: "Descripción", key: "desc", width: 26 },
    { header: "Estado", key: "status", width: 11 },
    { header: "Monto", key: "amount", width: 12, fmt: "#,##0.00" },
    { header: "Moneda", key: "cur", width: 8 },
    { header: "Dólar (CLP)", key: "fx", width: 11, fmt: "#,##0.00" },
    { header: "USD", key: "usd", width: 12, fmt: USD },
    { header: "CLP", key: "clp", width: 14, fmt: CLP },
    { header: "Cuenta en ROI", key: "counts", width: 12 },
    { header: "N.º de orden", key: "ref", width: 14 },
    { header: "Hash", key: "hash", width: 20 },
  ]);
  for (const e of data.expenses) {
    const dual = toDual({ amount: e.amount, currency: e.currency, fxUsdClp: e.fx_usd_clp, usdRate: e.usd_rate ?? undefined });
    const sign = e.kind === "refund" ? -1 : 1;
    ge.addRow({
      date: date(e.occurred_on), firm: e.firm_id ? firmName.get(e.firm_id) : "General", account: e.account_id ? accLabel.get(e.account_id) : null,
      kind: e.kind === "refund" ? "Reembolso" : "Gasto", cat: CATEGORY_LABEL[e.category as keyof typeof CATEGORY_LABEL] ?? e.category,
      desc: e.description, status: EXPENSE_STATUS_LABEL[e.status], amount: num(e.amount), cur: e.currency, fx: num(e.fx_usd_clp),
      usd: sign * Number(dual.usd.toFixed(2)), clp: sign * Number(dual.clp.toFixed(0)), counts: e.status === "paid" ? "Sí" : "No",
      ref: e.external_ref, hash: e.tx_hash,
    });
  }

  // --- Payouts
  const recv = new Map<string, { usd: number; est: boolean }>();
  for (const r of data.received) {
    const prev = recv.get(r.payout_id);
    recv.set(r.payout_id, { usd: (prev?.usd ?? 0) + Number(d(r.amount_usd).toFixed(2)), est: (prev?.est ?? false) || r.is_estimated });
  }
  const pa = sheet(wb, "Payouts", [
    { header: "Solicitado", key: "req", width: 12, fmt: "dd-mm-yyyy" },
    { header: "Pagado", key: "paid", width: 12, fmt: "dd-mm-yyyy" },
    { header: "Empresa", key: "firm", width: 20 },
    { header: "Cuenta", key: "account", width: 16 },
    { header: "Estado", key: "status", width: 12 },
    { header: "Retiro", key: "gross", width: 12, fmt: USD },
    { header: "Tu %", key: "pct", width: 8, fmt: '0.00"%"' },
    { header: "Tu parte", key: "share", width: 12, fmt: USD },
    { header: "Recibido", key: "rec", width: 12, fmt: USD },
    { header: "Recibido es", key: "basis", width: 12 },
    { header: "Notas", key: "notes", width: 24 },
  ]);
  for (const p of data.payouts) {
    const r = recv.get(p.id);
    pa.addRow({
      req: date(p.requested_on), paid: date(p.paid_on), firm: firmName.get(p.firm_id), account: accLabel.get(p.account_id),
      status: PAYOUT_STATUS_LABEL[p.status], gross: num(p.requested_amount), pct: num(p.trader_share_pct),
      share: Number(d(p.requested_amount).mul(d(p.trader_share_pct)).div(100).toFixed(2)),
      rec: r ? r.usd : null, basis: r ? (r.est ? "Estimado" : "Real") : null, notes: p.notes,
    });
  }

  // --- Cuentas
  const ac = sheet(wb, "Cuentas", [
    { header: "Cuenta", key: "label", width: 16 },
    { header: "ID empresa", key: "ext", width: 26 },
    { header: "Empresa", key: "firm", width: 20 },
    { header: "Plan", key: "plan", width: 24 },
    { header: "Nominal", key: "nominal", width: 12, fmt: USD },
    { header: "Fase", key: "phase", width: 12 },
    { header: "Estado", key: "status", width: 12 },
    { header: "Apertura", key: "open", width: 12, fmt: "dd-mm-yyyy" },
    { header: "Cierre", key: "close", width: 12, fmt: "dd-mm-yyyy" },
    { header: "Salió de", key: "origin", width: 16 },
    { header: "Notas", key: "notes", width: 24 },
  ]);
  for (const a of data.accounts) {
    ac.addRow({
      label: a.label, ext: a.external_id, firm: firmName.get(a.firm_id), plan: a.plan_name, nominal: num(a.nominal_size),
      phase: PHASE_LABEL[a.phase], status: STATUS_LABEL[a.status], open: date(a.opened_on), close: date(a.closed_on),
      origin: a.origin_account_id ? accLabel.get(a.origin_account_id) : null, notes: a.notes,
    });
  }

  // --- Empresas
  const em = sheet(wb, "Empresas", [
    { header: "Empresa", key: "name", width: 22 },
    { header: "Configurada", key: "conf", width: 12 },
    { header: "Tu %", key: "pct", width: 8, fmt: '0.00"%"' },
    { header: "% inicial (tramo)", key: "before", width: 16, fmt: '0.00"%"' },
    { header: "Hasta retirar", key: "thr", width: 14, fmt: USD },
    { header: "Comisión por retiro", key: "fee", width: 18, fmt: USD },
    { header: "Comisión es", key: "feeEst", width: 12 },
    { header: "Reglas de payout", key: "rules", width: 40 },
  ]);
  for (const f of data.firms) {
    em.addRow({
      name: f.name, conf: f.is_configured ? "Sí" : "No", pct: num(f.default_trader_share_pct), before: num(f.split_tier_pct_before),
      thr: num(f.split_tier_threshold), fee: num(f.default_transfer_fee), feeEst: f.transfer_fee_is_estimate ? "Estimada" : "Confirmada",
      rules: f.payout_rules_notes,
    });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// CSV en formato del importador (respaldo restaurable)
// ---------------------------------------------------------------------------
function csv(rows: (string | null | undefined)[][]): string {
  const cell = (v: string | null | undefined) => {
    const s = v ?? "";
    return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

const EXP_STATUS_CSV = { paid: "pagado", failed: "fallido", pending: "pendiente", void: "anulado" } as const;
const PAY_STATUS_CSV = { draft: "solicitado", requested: "solicitado", approved: "aprobado", paid: "pagado", rejected: "rechazado", cancelled: "cancelado" } as const;

/** Gastos (sin reembolsos: el importador no los admite; van en el Excel). */
export async function expensesCsv(db: Db): Promise<{ text: string; skippedRefunds: number }> {
  const { firms, expenses } = await load(db);
  const name = new Map(firms.map((f) => [f.id, f.name]));
  const rows = expenses.filter((e) => e.kind === "cost" && e.firm_id);
  return {
    skippedRefunds: expenses.length - rows.length,
    text: csv([
      ["firm", "external_ref", "occurred_on", "category", "description", "amount", "currency", "status"],
      ...rows.map((e) => [name.get(e.firm_id!), e.external_ref, e.occurred_on, e.category, e.description, d(e.amount).toString(), e.currency, EXP_STATUS_CSV[e.status]]),
    ]),
  };
}

export async function payoutsCsv(db: Db): Promise<string> {
  const { firms, accounts, payouts, receipts } = await load(db);
  const name = new Map(firms.map((f) => [f.id, f.name]));
  const acc = new Map(accounts.map((a) => [a.id, a]));
  const actual = new Map<string, { amount: string; on: string; currency: string }>();
  for (const r of receipts) if (r.receipts?.basis === "actual") actual.set(r.payout_id, { amount: r.receipts.amount, on: r.receipts.received_on, currency: r.receipts.currency });
  return csv([
    ["firm", "account_external_id", "requested_on", "approved_amount", "currency", "status", "amount_received", "received_on"],
    ...payouts.map((p) => {
      const a = acc.get(p.account_id);
      const real = actual.get(p.id);
      return [name.get(p.firm_id), a?.external_id ?? a?.label, p.requested_on, d(p.requested_amount).toString(), p.currency, PAY_STATUS_CSV[p.status], real ? d(real.amount).toString() : null, real?.on ?? null];
    }),
  ]);
}
