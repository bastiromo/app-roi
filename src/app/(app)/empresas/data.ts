import "server-only";
import { requireUser } from "@/lib/auth";

export interface FirmRow {
  id: string;
  name: string;
  website: string | null;
  default_trader_share_pct: string;
  split_tier_threshold: string | null;
  split_tier_pct_before: string | null;
  default_transfer_fee: string;
  transfer_fee_is_estimate: boolean;
  is_configured: boolean;
  is_active: boolean;
  payout_rules_notes: string | null;
  notes: string | null;
}

// Montos como texto: PostgREST devolvería numeric como número de coma flotante.
export const FIRM_COLUMNS =
  "id,name,website,default_trader_share_pct::text,split_tier_threshold::text,split_tier_pct_before::text," +
  "default_transfer_fee::text,transfer_fee_is_estimate,is_configured,is_active,payout_rules_notes,notes";

export async function listFirms(): Promise<FirmRow[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("firms")
    .select(FIRM_COLUMNS)
    .is("deleted_at", null)
    .order("is_configured", { ascending: false })
    .order("is_active", { ascending: false })
    .order("name")
    .returns<FirmRow[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getFirm(id: string): Promise<FirmRow | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("firms").select(FIRM_COLUMNS).eq("id", id).is("deleted_at", null).returns<FirmRow[]>().maybeSingle();
  return data;
}
