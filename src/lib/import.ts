/** Plan y ejecución de importaciones. Recibe el cliente de base y la búsqueda de dólar, para poder probarse contra la API real. */
import { parseImport, type ExpenseImportRow, type PayoutImportRow, type RowError } from "@/domain/importer";
import { d, toDual } from "@/domain/money";
import { estimateReceived, parseDecimalInput } from "@/domain/schemas";
import { suggestTraderShare } from "@/domain/split";
import { dbMessage } from "@/lib/form";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;
export type FxLookupFn = (isoDate: string) => Promise<{ rate: string } | null>;

export interface PreviewRow {
  line: number;
  state: "new" | "duplicate" | "error";
  note: string | null;
  date: string;
  firm: string;
  who: string; // n.º de orden (gasto) o cuenta (payout)
  detail: string | null;
  amount: string; // monto original formateado
  status: string;
  usd: string | null; // gasto: costo en USD; payout: recibido
  estimated: boolean;
  newAccount: boolean;
}

export interface ImportPreview {
  kind: "expenses" | "payouts" | null;
  rows: PreviewRow[];
  errors: RowError[];
  counts: { new: number; duplicate: number; error: number };
  totalUsd: string; // de las filas nuevas (costos pagados o recibido)
  missingFxDates: string[];
  newAccounts: string[];
}

interface FirmInfo {
  id: string;
  name: string;
  is_configured: boolean;
  default_trader_share_pct: string;
  split_tier_threshold: string | null;
  split_tier_pct_before: string | null;
  default_transfer_fee: string;
}

const STATUS_LABEL: Record<string, string> = {
  paid: "Pagado", failed: "Fallido", pending: "Pendiente", void: "Anulado",
  requested: "Solicitado", approved: "Aprobado", rejected: "Rechazado", cancelled: "Cancelado",
};

const usdFmt = new Intl.NumberFormat("es-CL", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const plain = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

async function firmsByName(supabase: Supa) {
  const { data } = await supabase
    .from("firms")
    .select("id,name,is_configured,default_trader_share_pct::text,split_tier_threshold::text,split_tier_pct_before::text,default_transfer_fee::text")
    .is("deleted_at", null)
    .returns<FirmInfo[]>();
  return new Map((data ?? []).map((f) => [f.name.toLowerCase(), f]));
}

async function fxForDates(lookup: FxLookupFn, dates: string[], fallback: string | null) {
  const out = new Map<string, { rate: string; source: "dolar_observado" | "manual" }>();
  const unique = [...new Set(dates)].sort();
  const missing: string[] = [];
  // De a 4 en paralelo para no saturar el servicio
  for (let i = 0; i < unique.length; i += 4) {
    const chunk = unique.slice(i, i + 4);
    const res = await Promise.all(chunk.map((dt) => lookup(dt)));
    chunk.forEach((dt, j) => {
      const r = res[j];
      if (r) out.set(dt, { rate: r.rate, source: "dolar_observado" });
      else if (fallback) out.set(dt, { rate: fallback, source: "manual" });
      else missing.push(dt);
    });
  }
  return { fx: out, missing };
}

function counts<T>(items: T[], key: (x: T) => string) {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
  return m;
}

// ---------------------------------------------------------------------------
// Plan de importación (se calcula igual en la vista previa y al confirmar)
// ---------------------------------------------------------------------------
interface ExpensePlan {
  preview: ImportPreview;
  inserts: Record<string, unknown>[];
}

export async function planExpenses(supabase: Supa, lookup: FxLookupFn, rows: ExpenseImportRow[], errors: RowError[], fallbackFx: string | null): Promise<ExpensePlan> {
  const firms = await firmsByName(supabase);
  const { fx, missing } = await fxForDates(lookup, rows.map((r) => r.occurredOn), fallbackFx);

  // Existentes: por n.º de orden y, sin orden, por (empresa, fecha, monto, moneda)
  const firmIds = [...new Set(rows.map((r) => firms.get(r.firm.toLowerCase())?.id).filter(Boolean))] as string[];
  const { data: existing } = firmIds.length
    ? await supabase
        .from("expenses")
        .select("firm_id,external_ref,occurred_on,amount::text,currency")
        .in("firm_id", firmIds)
        .eq("kind", "cost")
        .is("deleted_at", null)
        .returns<{ firm_id: string; external_ref: string | null; occurred_on: string; amount: string; currency: string }[]>()
    : { data: [] };
  const existingRefs = new Set((existing ?? []).filter((e) => e.external_ref).map((e) => `${e.firm_id}|${e.external_ref}`));
  const simKey = (firmId: string, date: string, amount: string, cur: string) => `${firmId}|${date}|${d(amount).toFixed(4)}|${cur}`;
  const existingSim = counts((existing ?? []).filter((e) => !e.external_ref), (e) => simKey(e.firm_id, e.occurred_on, e.amount, e.currency));
  const usedSim = new Map<string, number>();

  const preview: PreviewRow[] = [];
  const inserts: Record<string, unknown>[] = [];
  let total = d(0);

  for (const r of rows) {
    const firm = firms.get(r.firm.toLowerCase());
    const rate = fx.get(r.occurredOn);
    const base = {
      line: r.line, date: r.occurredOn, firm: firm?.name ?? r.firm, who: r.externalRef ? `#${r.externalRef}` : "—",
      detail: r.description, amount: `${plain.format(Number(r.amount))} ${r.currency}`, status: STATUS_LABEL[r.status], estimated: false, newAccount: false,
    };
    if (!firm) {
      preview.push({ ...base, state: "error", note: `La empresa "${r.firm}" no existe. Créala en Empresas.`, usd: null });
      continue;
    }
    if (!rate) {
      preview.push({ ...base, state: "error", note: "Sin dólar para esta fecha.", usd: null });
      continue;
    }
    let dup = false;
    if (r.externalRef) dup = existingRefs.has(`${firm.id}|${r.externalRef}`);
    else {
      const k = simKey(firm.id, r.occurredOn, r.amount, r.currency);
      const used = usedSim.get(k) ?? 0;
      if (used < (existingSim.get(k) ?? 0)) {
        dup = true;
        usedSim.set(k, used + 1);
      }
    }
    const dual = toDual({ amount: r.amount, currency: r.currency, fxUsdClp: rate.rate });
    if (dup) {
      preview.push({ ...base, state: "duplicate", note: "Ya está registrado.", usd: usdFmt.format(Number(dual.usd.toFixed(2))) });
      continue;
    }
    if (r.status === "paid") total = total.add(dual.usd);
    preview.push({ ...base, state: "new", note: r.status === "paid" ? null : "No suma al ROI (no pagado).", usd: usdFmt.format(Number(dual.usd.toFixed(2))) });
    inserts.push({
      kind: "cost", status: r.status, occurred_on: r.occurredOn, firm_id: firm.id, category: r.category, description: r.description,
      amount: r.amount, currency: r.currency, usd_rate: r.currency === "USDT" || r.currency === "USDC" ? "1" : null,
      fx_usd_clp: rate.rate, fx_source: rate.source, external_ref: r.externalRef,
    });
  }

  return {
    preview: {
      kind: "expenses",
      rows: preview,
      errors,
      counts: tally(preview, errors),
      totalUsd: usdFmt.format(Number(total.toFixed(2))),
      missingFxDates: missing,
      newAccounts: [],
    },
    inserts,
  };
}

interface PayoutPlanItem {
  firmId: string;
  accountKey: string; // id existente o "new:<externalId>"
  row: PayoutImportRow;
  pct: string;
  receipt: { mode: "estimated" | "actual" | "none"; amount: string | null; currency: string; on: string; fee: string };
  fx: { rate: string; source: "dolar_observado" | "manual" } | null;
}

export async function planPayouts(supabase: Supa, lookup: FxLookupFn, rows: PayoutImportRow[], errors: RowError[], fallbackFx: string | null) {
  const firms = await firmsByName(supabase);
  const sorted = [...rows].sort((a, b) => a.requestedOn.localeCompare(b.requestedOn) || a.line - b.line);
  const paidDates = sorted.filter((r) => r.status === "paid").map((r) => r.receivedOn ?? r.requestedOn);
  const { fx, missing } = await fxForDates(lookup, paidDates, fallbackFx);

  const firmIds = [...new Set(sorted.map((r) => firms.get(r.firm.toLowerCase())?.id).filter(Boolean))] as string[];
  const [{ data: accounts }, { data: existing }] = await Promise.all([
    firmIds.length
      ? supabase.from("accounts").select("id,firm_id,label,external_id").in("firm_id", firmIds).is("deleted_at", null)
          .returns<{ id: string; firm_id: string; label: string; external_id: string | null }[]>()
      : Promise.resolve({ data: [] as { id: string; firm_id: string; label: string; external_id: string | null }[] }),
    firmIds.length
      ? supabase.from("payouts").select("firm_id,account_id,requested_on,requested_amount::text,status").in("firm_id", firmIds).is("deleted_at", null)
          .returns<{ firm_id: string; account_id: string; requested_on: string; requested_amount: string; status: string }[]>()
      : Promise.resolve({ data: [] as { firm_id: string; account_id: string; requested_on: string; requested_amount: string; status: string }[] }),
  ]);

  const findAccount = (firmId: string, r: PayoutImportRow) =>
    (accounts ?? []).find((a) => a.firm_id === firmId && (a.external_id === r.accountExternalId || a.label.toLowerCase() === r.accountExternalId.toLowerCase())) ??
    (accounts ?? []).find((a) => a.firm_id === firmId && !a.external_id && a.label.toLowerCase() === r.accountLabel.toLowerCase());

  const key = (acc: string, date: string, amount: string) => `${acc}|${date}|${d(amount).toFixed(2)}`;
  const existingCount = counts(existing ?? [], (p) => key(p.account_id, p.requested_on, p.requested_amount));
  const usedDup = new Map<string, number>();
  // Retirado acumulado por empresa (para reglas por tramos), partiendo de lo ya registrado
  const withdrawn = new Map<string, { date: string; amount: string }[]>();
  for (const p of existing ?? []) if (p.status === "paid") withdrawn.set(p.firm_id, [...(withdrawn.get(p.firm_id) ?? []), { date: p.requested_on, amount: p.requested_amount }]);

  const preview: PreviewRow[] = [];
  const plan: PayoutPlanItem[] = [];
  const newAccounts = new Map<string, string>(); // externalId → label
  let total = d(0);

  for (const r of sorted) {
    const firm = firms.get(r.firm.toLowerCase());
    const base = {
      line: r.line, date: r.requestedOn, firm: firm?.name ?? r.firm, who: r.accountLabel, detail: r.accountExternalId,
      amount: usdFmt.format(Number(r.amount)), status: STATUS_LABEL[r.status], newAccount: false, estimated: false,
    };
    if (!firm) {
      preview.push({ ...base, state: "error", note: `La empresa "${r.firm}" no existe.`, usd: null });
      continue;
    }
    if (!firm.is_configured) {
      preview.push({ ...base, state: "error", note: `Configura ${firm.name} (su % y comisión) antes de importar payouts.`, usd: null });
      continue;
    }
    const acc = findAccount(firm.id, r);
    const accountKey = acc?.id ?? `new:${firm.id}:${r.accountExternalId}`;
    if (!acc) newAccounts.set(`${firm.id}:${r.accountExternalId}`, r.accountLabel);

    if (acc) {
      const k = key(acc.id, r.requestedOn, r.amount);
      const used = usedDup.get(k) ?? 0;
      if (used < (existingCount.get(k) ?? 0)) {
        usedDup.set(k, used + 1);
        preview.push({ ...base, state: "duplicate", note: "Ya está registrado.", usd: null });
        continue;
      }
    }

    const before = (withdrawn.get(firm.id) ?? []).filter((w) => w.date <= r.requestedOn).reduce((t, w) => t.add(d(w.amount)), d(0));
    const split = suggestTraderShare(
      { defaultTraderSharePct: firm.default_trader_share_pct, splitTierThreshold: firm.split_tier_threshold, splitTierPctBefore: firm.split_tier_pct_before },
      before.toString(),
      r.amount,
    );
    const pct = split.pct.toString();
    const paid = r.status === "paid";
    const on = r.receivedOn ?? r.requestedOn;
    const rate = paid ? fx.get(on) ?? null : null;
    if (paid && !rate) {
      preview.push({ ...base, state: "error", note: "Sin dólar para la fecha de pago.", usd: null });
      continue;
    }
    if (paid) withdrawn.set(firm.id, [...(withdrawn.get(firm.id) ?? []), { date: r.requestedOn, amount: r.amount }]);

    const fee = firm.default_transfer_fee;
    const receipt: PayoutPlanItem["receipt"] = !paid
      ? { mode: "none", amount: null, currency: "USD", on, fee }
      : r.receivedAmount
        ? { mode: "actual", amount: r.receivedAmount, currency: r.currency, on, fee: "0" }
        : { mode: "estimated", amount: estimateReceived(r.amount, pct, fee), currency: "USD", on, fee };
    if (receipt.amount && receipt.mode !== "none") total = total.add(d(receipt.amount));

    plan.push({ firmId: firm.id, accountKey, row: r, pct, receipt, fx: rate });
    preview.push({
      ...base,
      state: "new",
      newAccount: !acc,
      estimated: receipt.mode === "estimated",
      note: receipt.mode === "estimated" ? `${plain.format(Number(pct))} % − ${plain.format(Number(fee))} de comisión` : receipt.mode === "none" ? "Por cobrar (no pagado)" : null,
      usd: receipt.amount ? usdFmt.format(Number(receipt.amount)) : null,
    });
  }

  preview.sort((a, b) => a.line - b.line);
  return {
    preview: {
      kind: "payouts" as const,
      rows: preview,
      errors,
      counts: tally(preview, errors),
      totalUsd: usdFmt.format(Number(total.toFixed(2))),
      missingFxDates: missing,
      newAccounts: [...newAccounts.values()],
    },
    plan,
    newAccounts,
  };
}

function tally(rows: PreviewRow[], errors: RowError[]) {
  return {
    new: rows.filter((r) => r.state === "new").length,
    duplicate: rows.filter((r) => r.state === "duplicate").length,
    error: rows.filter((r) => r.state === "error").length + errors.length,
  };
}

function cleanFx(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = parseDecimalInput(raw);
  return v && v !== "NaN" && Number(v) > 0 ? v : null;
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------
export async function buildPreview(supabase: Supa, lookup: FxLookupFn, text: string, fallbackFxRaw: string | null): Promise<ImportPreview> {
  const parsed = parseImport(text);
  const fallbackFx = cleanFx(fallbackFxRaw);
  if (parsed.kind === "expenses") return (await planExpenses(supabase, lookup, parsed.rows, parsed.errors, fallbackFx)).preview;
  if (parsed.kind === "payouts") return (await planPayouts(supabase, lookup, parsed.rows, parsed.errors, fallbackFx)).preview;
  return { kind: null, rows: [], errors: parsed.errors, counts: { new: 0, duplicate: 0, error: parsed.errors.length }, totalUsd: "", missingFxDates: [], newAccounts: [] };
}

export interface ImportResult {
  ok: boolean;
  message: string;
  batch?: string;
}

export async function runImport(supabase: Supa, lookup: FxLookupFn, text: string, fallbackFxRaw: string | null, now = new Date()): Promise<ImportResult & { kind?: "expenses" | "payouts" }> {
  const parsed = parseImport(text);
  const fallbackFx = cleanFx(fallbackFxRaw);
  const batch = `import-${now.toISOString().slice(0, 19).replace(/[-:T]/g, "")}`;

  if (parsed.kind === "expenses") {
    const { inserts } = await planExpenses(supabase, lookup, parsed.rows, parsed.errors, fallbackFx);
    if (inserts.length === 0) return { ok: false, message: "No hay filas nuevas para importar." };
    const { error } = await supabase.from("expenses").insert(inserts.map((x) => ({ ...x, source: batch })));
    if (error) return { ok: false, message: error.code === "23505" ? "Alguna orden ya existe; vuelve a revisar." : dbMessage(error) };
    return { ok: true, kind: "expenses", batch, message: `${inserts.length} gastos importados.` };
  }

  if (parsed.kind === "payouts") {
    const { plan, newAccounts } = await planPayouts(supabase, lookup, parsed.rows, parsed.errors, fallbackFx);
    if (plan.length === 0) return { ok: false, message: "No hay filas nuevas para importar." };

    // 1) Cuentas nuevas (financiadas), con nota del lote para poder deshacer
    const accountIds = new Map<string, string>();
    if (newAccounts.size > 0) {
      const toCreate = [...newAccounts.entries()].map(([k, label]) => {
        const [firmId, ...ext] = k.split(":");
        const externalId = ext.join(":");
        const first = plan.filter((p) => p.accountKey === `new:${k}`).map((p) => p.row.requestedOn).sort()[0];
        return { firm_id: firmId, label, external_id: externalId, phase: "financiada", status: "activa", opened_on: first ?? null, notes: `Creada al importar (${batch})` };
      });
      const { data, error } = await supabase.from("accounts").insert(toCreate).select("id,firm_id,external_id");
      if (error || !data) return { ok: false, message: dbMessage(error ?? { message: "sin respuesta" }) };
      for (const a of data) accountIds.set(`new:${a.firm_id}:${a.external_id}`, a.id as string);
    }

    // 2) Payouts uno a uno (cada uno con su recibo, en su propia transacción)
    const created: string[] = [];
    for (const p of plan) {
      const accountId = p.accountKey.startsWith("new:") ? accountIds.get(p.accountKey) : p.accountKey;
      const { data, error } = await supabase.rpc("save_payout", {
        p_id: null, p_firm_id: p.firmId, p_account_id: accountId, p_status: p.row.status,
        p_requested_on: p.row.requestedOn, p_paid_on: p.row.status === "paid" ? p.receipt.on : null,
        p_requested_amount: p.row.amount, p_trader_share_pct: p.pct, p_firm_fee_amount: "0", p_currency: "USD",
        p_notes: null, p_receipt_mode: p.receipt.mode, p_received_amount: p.receipt.amount,
        p_received_currency: p.receipt.currency, p_received_on: p.receipt.on,
        p_usd_rate: p.receipt.currency === "USDT" || p.receipt.currency === "USDC" ? "1" : null,
        p_fx_usd_clp: p.fx?.rate ?? null, p_fx_source: p.fx?.source ?? null,
        p_processor_fee: p.receipt.mode === "estimated" ? p.receipt.fee : "0", p_tx_hash: null,
      });
      if (error) {
        await revertBatch(supabase, batch, created);
        return { ok: false, message: `Línea ${p.row.line}: ${dbMessage(error)}. No se importó nada.` };
      }
      created.push(data as string);
    }
    await supabase.from("payouts").update({ source: batch }).in("id", created);
    const extra = newAccounts.size ? ` y ${newAccounts.size} cuentas nuevas` : "";
    return { ok: true, kind: "payouts", batch, message: `${created.length} payouts importados${extra}.` };
  }

  return { ok: false, message: parsed.errors[0]?.message ?? "Formato no reconocido." };
}

/** Deshace un lote: elimina (lógicamente) gastos, payouts y cuentas creadas por esa importación. */
export async function revertBatch(supabase: Supa, batch: string, payoutIds?: string[]): Promise<ImportResult> {
  if (!/^import-\d{14}$/.test(batch)) return { ok: false, message: "Lote inválido." };
  await supabase.from("expenses").update({ deleted_at: new Date().toISOString() }).eq("source", batch).is("deleted_at", null);
  const ids =
    payoutIds ??
    ((await supabase.from("payouts").select("id").eq("source", batch).is("deleted_at", null)).data ?? []).map((p) => p.id as string);
  if (ids.length) await supabase.rpc("delete_payouts", { p_ids: ids });
  const { data: accs } = await supabase.from("accounts").select("id").eq("notes", `Creada al importar (${batch})`).is("deleted_at", null);
  if (accs?.length) await supabase.rpc("delete_accounts", { p_ids: accs.map((a) => a.id as string) });
  return { ok: true, message: "Importación deshecha." };
}
