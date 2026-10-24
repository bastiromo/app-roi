"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { estimateReceived, payoutSchema } from "@/domain/schemas";
import { requireUser } from "@/lib/auth";
import { dbMessage, fieldErrors, type FormState, formValues } from "@/lib/form";

export async function savePayout(id: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireUser();
  const values = formValues(form);
  const parsed = payoutSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const p = parsed.data;

  const paid = p.status === "paid";
  const receivedOn = p.received_on ?? p.paid_on ?? p.requested_on;
  const estimated = paid && p.receipt_mode === "estimated";
  const stable = p.received_currency === "USDT" || p.received_currency === "USDC";

  const { data: newId, error } = await supabase.rpc("save_payout", {
    p_id: id,
    p_firm_id: p.firm_id,
    p_account_id: p.account_id,
    p_status: p.status,
    p_requested_on: p.requested_on,
    p_paid_on: paid ? (p.paid_on ?? receivedOn) : p.paid_on,
    p_requested_amount: p.requested_amount,
    p_trader_share_pct: p.trader_share_pct,
    p_firm_fee_amount: "0",
    p_currency: "USD",
    p_notes: p.notes,
    p_receipt_mode: paid ? p.receipt_mode : "none",
    p_received_amount: estimated ? estimateReceived(p.requested_amount!, p.trader_share_pct!, p.transfer_fee) : p.received_amount,
    p_received_currency: estimated ? "USD" : p.received_currency,
    p_received_on: receivedOn,
    p_usd_rate: !estimated && stable ? (p.usd_rate ?? "1") : null,
    p_fx_usd_clp: p.fx_usd_clp,
    p_fx_source: p.fx_source,
    p_processor_fee: estimated ? (p.transfer_fee ?? "0") : "0",
    p_tx_hash: estimated ? null : p.tx_hash,
  });
  if (error) {
    if (error.code === "23505") return { errors: { tx_hash: "Ese hash de transacción ya está registrado." }, values };
    if (error.code === "23503") return { errors: { account_id: "La cuenta no es de la empresa elegida." }, values };
    if (error.code === "23514") return { message: error.message, values };
    return { message: dbMessage(error), values };
  }

  revalidatePath("/payouts");
  revalidatePath("/");
  redirect(`/payouts?guardado=1#${newId}`);
}

export interface PayoutDeleteResult {
  ok: boolean;
  message: string;
  ids?: string[];
}

export async function deletePayouts(ids: string[]): Promise<PayoutDeleteResult> {
  const { supabase } = await requireUser();
  const clean = ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (clean.length === 0) return { ok: false, message: "No seleccionaste ningún payout." };
  const { data, error } = await supabase.rpc("delete_payouts", { p_ids: clean });
  if (error) return { ok: false, message: dbMessage(error) };
  revalidatePath("/payouts");
  revalidatePath("/");
  const n = Number(data ?? 0);
  return { ok: true, ids: clean, message: n === 1 ? "Payout eliminado." : `${n} payouts eliminados.` };
}

export async function restorePayouts(ids: string[]): Promise<PayoutDeleteResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("restore_payouts", { p_ids: ids });
  if (error) return { ok: false, message: dbMessage(error) };
  revalidatePath("/payouts");
  revalidatePath("/");
  return { ok: true, message: "Eliminación deshecha." };
}
