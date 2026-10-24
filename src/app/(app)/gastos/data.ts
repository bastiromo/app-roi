import "server-only";
import { requireUser } from "@/lib/auth";
import { Q } from "@/lib/queries";

export interface ExpenseRow {
  id: string;
  kind: "cost" | "refund";
  refund_of_id: string | null;
  status: "paid" | "pending" | "failed" | "void";
  occurred_on: string;
  firm_id: string | null;
  account_id: string | null;
  category: string;
  description: string | null;
  amount: string;
  currency: "USD" | "USDT" | "USDC" | "CLP";
  usd_rate: string | null;
  fx_usd_clp: string;
  fx_source: string;
  external_ref: string | null;
  tx_hash: string | null;
  firms: { name: string } | null;
  accounts: { label: string } | null;
}

const COLUMNS = Q.expenses;

export interface ExpenseFilter {
  empresa?: string;
  categoria?: string;
  desde?: string;
  hasta?: string;
}

export async function listExpenses(f: ExpenseFilter = {}): Promise<ExpenseRow[]> {
  const { supabase } = await requireUser();
  let q = supabase.from("expenses").select(COLUMNS).is("deleted_at", null);
  if (f.empresa === "general") q = q.is("firm_id", null);
  else if (f.empresa) q = q.eq("firm_id", f.empresa);
  if (f.categoria) q = q.eq("category", f.categoria);
  if (f.desde) q = q.gte("occurred_on", f.desde);
  if (f.hasta) q = q.lte("occurred_on", f.hasta);
  const { data, error } = await q.order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).returns<ExpenseRow[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getExpense(id: string): Promise<ExpenseRow | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("expenses").select(COLUMNS).eq("id", id).is("deleted_at", null).returns<ExpenseRow[]>().maybeSingle();
  return data;
}

/** Opciones para el formulario: empresas configuradas, cuentas y gastos reembolsables. */
export async function expenseFormOptions() {
  const { supabase } = await requireUser();
  const [{ data: firms }, { data: accounts }, { data: costs }] = await Promise.all([
    supabase.from("firms").select("id,name").eq("is_configured", true).is("deleted_at", null).order("name")
      .returns<{ id: string; name: string }[]>(),
    supabase.from("accounts").select("id,firm_id,label").is("deleted_at", null).order("label")
      .returns<{ id: string; firm_id: string; label: string }[]>(),
    supabase.from("expenses").select(Q.refundableCosts)
      .eq("kind", "cost").eq("status", "paid").is("deleted_at", null).order("occurred_on", { ascending: false }).limit(300)
      .returns<{ id: string; firm_id: string | null; occurred_on: string; amount: string; currency: string; description: string | null; category: string }[]>(),
  ]);
  return { firms: firms ?? [], accounts: accounts ?? [], costs: costs ?? [] };
}
