import "server-only";
import { requireUser } from "@/lib/auth";

export interface AccountRow {
  id: string;
  firm_id: string;
  label: string;
  external_id: string | null;
  plan_name: string | null;
  nominal_size: string | null;
  phase: "evaluacion" | "financiada" | "live";
  status: "activa" | "aprobada" | "suspendida" | "perdida" | "cerrada";
  origin_account_id: string | null;
  opened_on: string | null;
  closed_on: string | null;
  notes: string | null;
  firms: { name: string } | null;
  origin: { id: string; label: string } | null;
}

export const ACCOUNT_COLUMNS =
  "id,firm_id,label,external_id,plan_name,nominal_size::text,phase,status,origin_account_id,opened_on,closed_on,notes,firms(name),origin:accounts!origin_account_id(id,label)";

export async function listAccounts(filter: { firm?: string; status?: string } = {}): Promise<AccountRow[]> {
  const { supabase } = await requireUser();
  let q = supabase.from("accounts").select(ACCOUNT_COLUMNS).is("deleted_at", null);
  if (filter.firm) q = q.eq("firm_id", filter.firm);
  if (filter.status) q = q.eq("status", filter.status);
  const { data, error } = await q.order("opened_on", { ascending: false, nullsFirst: false }).order("label").returns<AccountRow[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getAccount(id: string) {
  const { supabase } = await requireUser();
  const [{ data: account }, { data: history }] = await Promise.all([
    supabase.from("accounts").select(ACCOUNT_COLUMNS).eq("id", id).is("deleted_at", null).returns<AccountRow[]>().maybeSingle(),
    supabase
      .from("account_status_history")
      .select("phase,status,changed_at")
      .eq("account_id", id)
      .order("changed_at", { ascending: false })
      .returns<{ phase: AccountRow["phase"]; status: AccountRow["status"]; changed_at: string }[]>(),
  ]);
  if (!account) return null;
  const { data: child } = await supabase
    .from("accounts")
    .select("id,label")
    .eq("origin_account_id", id)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; label: string }>();
  return { account, history: history ?? [], fundedFrom: account.origin, fundedChild: child };
}

/** Empresas y cuentas para los selectores del formulario. */
export async function accountFormOptions() {
  const { supabase } = await requireUser();
  const [{ data: firms }, { data: accounts }] = await Promise.all([
    supabase.from("firms").select("id,name,is_active,is_configured").is("deleted_at", null).order("name")
      .returns<{ id: string; name: string; is_active: boolean; is_configured: boolean }[]>(),
    supabase.from("accounts").select("id,firm_id,label,phase").is("deleted_at", null).order("label")
      .returns<{ id: string; firm_id: string; label: string; phase: AccountRow["phase"] }[]>(),
  ]);
  return { firms: firms ?? [], accounts: accounts ?? [] };
}
