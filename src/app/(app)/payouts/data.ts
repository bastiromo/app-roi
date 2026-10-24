import "server-only";
import { d } from "@/domain/money";
import { requireUser } from "@/lib/auth";

export interface PayoutRow {
  id: string;
  firm_id: string;
  account_id: string;
  status: "draft" | "requested" | "approved" | "paid" | "rejected" | "cancelled";
  requested_on: string;
  paid_on: string | null;
  requested_amount: string;
  trader_share_pct: string;
  firm_fee_amount: string;
  currency: "USD" | "USDT" | "USDC" | "CLP";
  notes: string | null;
  firms: { name: string } | null;
  accounts: { label: string } | null;
}

const COLUMNS =
  "id,firm_id,account_id,status,requested_on,paid_on,requested_amount::text,trader_share_pct::text,firm_fee_amount::text,currency,notes,firms(name),accounts(label)";

export interface ReceivedInfo {
  usd: string;
  clp: string;
  estimated: boolean;
}

/** Dinero recibido por payout, desde la misma vista que usa el Resumen. */
async function receivedByPayout(ids: string[]) {
  const { supabase } = await requireUser();
  const out = new Map<string, ReceivedInfo>();
  if (ids.length === 0) return out;
  const { data } = await supabase
    .from("cash_flows")
    .select("payout_id,amount_usd::text,amount_clp::text,is_estimated")
    .eq("flow_type", "payout_recibido")
    .in("payout_id", ids)
    .returns<{ payout_id: string; amount_usd: string; amount_clp: string; is_estimated: boolean }[]>();
  for (const r of data ?? []) {
    const prev = out.get(r.payout_id);
    out.set(r.payout_id, {
      usd: d(prev?.usd ?? "0").add(d(r.amount_usd)).toString(),
      clp: d(prev?.clp ?? "0").add(d(r.amount_clp)).toString(),
      estimated: (prev?.estimated ?? false) || r.is_estimated,
    });
  }
  return out;
}

export async function listPayouts(f: { empresa?: string; estado?: string } = {}) {
  const { supabase } = await requireUser();
  let q = supabase.from("payouts").select(COLUMNS).is("deleted_at", null);
  if (f.empresa) q = q.eq("firm_id", f.empresa);
  if (f.estado) q = q.eq("status", f.estado);
  const { data, error } = await q.order("requested_on", { ascending: false }).order("created_at", { ascending: false }).returns<PayoutRow[]>();
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const received = await receivedByPayout(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, received: received.get(r.id) ?? null }));
}

export async function getPayout(id: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("payouts").select(COLUMNS).eq("id", id).is("deleted_at", null).returns<PayoutRow[]>().maybeSingle();
  if (!data) return null;
  const { data: rec } = await supabase
    .from("receipt_allocations")
    .select("receipts(received_on,basis,amount::text,currency,usd_rate::text,fx_usd_clp::text,fx_source,processor_fee::text,tx_hash,deleted_at)")
    .eq("payout_id", id)
    .returns<{ receipts: { received_on: string; basis: "actual" | "estimated"; amount: string; currency: string; usd_rate: string | null; fx_usd_clp: string; fx_source: string; processor_fee: string; tx_hash: string | null; deleted_at: string | null } | null }[]>();
  const receipt = (rec ?? []).map((r) => r.receipts).find((r) => r && !r.deleted_at) ?? null;
  return { payout: data, receipt };
}

/** Datos para el formulario: empresas con su regla, cuentas y retiros pagados (para el % por tramos). */
export async function payoutFormOptions() {
  const { supabase } = await requireUser();
  const [{ data: firms }, { data: accounts }, { data: paid }] = await Promise.all([
    supabase
      .from("firms")
      .select("id,name,default_trader_share_pct::text,split_tier_threshold::text,split_tier_pct_before::text,default_transfer_fee::text,transfer_fee_is_estimate")
      .eq("is_configured", true)
      .is("deleted_at", null)
      .order("name")
      .returns<{ id: string; name: string; default_trader_share_pct: string; split_tier_threshold: string | null; split_tier_pct_before: string | null; default_transfer_fee: string; transfer_fee_is_estimate: boolean }[]>(),
    supabase.from("accounts").select("id,firm_id,label,phase,status").is("deleted_at", null).order("label")
      .returns<{ id: string; firm_id: string; label: string; phase: string; status: string }[]>(),
    supabase.from("payouts").select("id,firm_id,requested_on,requested_amount::text").eq("status", "paid").is("deleted_at", null)
      .returns<{ id: string; firm_id: string; requested_on: string; requested_amount: string }[]>(),
  ]);
  return { firms: firms ?? [], accounts: accounts ?? [], paid: paid ?? [] };
}
