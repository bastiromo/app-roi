import "server-only";
import { requireUser } from "@/lib/auth";
import { Q } from "@/lib/queries";

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
  /** Se completa aparte (no con un embed: en una relación de la tabla consigo misma era ambiguo). */
  origin?: { id: string; label: string } | null;
}

async function attachOrigins(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], rows: AccountRow[]) {
  const ids = [...new Set(rows.map((r) => r.origin_account_id).filter((x): x is string => Boolean(x)))];
  if (ids.length === 0) return rows.map((r) => ({ ...r, origin: null }));
  const { data } = await supabase.from("accounts").select("id,label").in("id", ids).is("deleted_at", null)
    .returns<{ id: string; label: string }[]>();
  const byId = new Map((data ?? []).map((o) => [o.id, o]));
  return rows.map((r) => ({ ...r, origin: r.origin_account_id ? (byId.get(r.origin_account_id) ?? null) : null }));
}

export const ACCOUNT_COLUMNS = Q.accounts;

export async function listAccounts(filter: { firm?: string; status?: string } = {}): Promise<AccountRow[]> {
  const { supabase } = await requireUser();
  let q = supabase.from("accounts").select(ACCOUNT_COLUMNS).is("deleted_at", null);
  if (filter.firm) q = q.eq("firm_id", filter.firm);
  if (filter.status) q = q.eq("status", filter.status);
  const { data, error } = await q.order("opened_on", { ascending: false, nullsFirst: false }).order("label").returns<AccountRow[]>();
  if (error) throw new Error(error.message);
  return attachOrigins(supabase, data ?? []);
}

export async function getAccount(id: string) {
  const { supabase } = await requireUser();
  const [{ data: account }, { data: history }] = await Promise.all([
    supabase.from("accounts").select(ACCOUNT_COLUMNS).eq("id", id).is("deleted_at", null).returns<AccountRow[]>().maybeSingle(),
    supabase
      .from("account_status_history")
      .select(Q.statusHistory)
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
  const [withOrigin] = await attachOrigins(supabase, [account]);
  return { account: withOrigin, history: history ?? [], fundedFrom: withOrigin.origin ?? null, fundedChild: child };
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
