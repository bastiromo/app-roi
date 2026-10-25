"use server";

import { revalidatePath } from "next/cache";
import { conversionSchema } from "@/domain/schemas";
import { requireUser } from "@/lib/auth";
import { dbMessage, fieldErrors, type FormState, formValues } from "@/lib/form";
import { lookupUsdClp } from "@/lib/fx";

export async function saveConversion(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireUser();
  const values = formValues(form);
  const parsed = conversionSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const v = parsed.data;

  // Dólar observado del día como referencia (si el servicio no responde, se guarda sin comparar)
  const fx = await lookupUsdClp(v.converted_on!);
  const fee = v.fee_amount ?? "0";
  const { error } = await supabase.from("fx_conversions").insert({
    converted_on: v.converted_on,
    from_amount: v.from_amount,
    from_currency: v.from_currency,
    to_amount: v.to_amount,
    to_currency: "CLP",
    fee_amount: fee,
    fee_currency: fee === "0" ? null : v.fee_currency === "CLP" ? "CLP" : v.from_currency,
    exchange_label: v.exchange_label ?? "P2P",
    tx_ref: v.tx_ref,
    notes: v.notes,
    ref_usd_clp: fx?.rate ?? null,
  });
  if (error) {
    if (error.code === "23505") return { errors: { tx_ref: "Ya registraste una venta con ese n.º de orden." }, values };
    return { message: dbMessage(error), values };
  }
  revalidatePath("/conversiones");
  return {
    message: fx ? "Venta registrada." : "Venta registrada. No pude obtener el dólar observado de ese día, así que no se compara.",
  };
}

export async function deleteConversion(id: string): Promise<{ ok: boolean; message: string }> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("fx_conversions").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/conversiones");
  return error ? { ok: false, message: dbMessage(error) } : { ok: true, message: "Venta eliminada." };
}

export async function restoreConversion(id: string): Promise<{ ok: boolean; message: string }> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("fx_conversions").update({ deleted_at: null }).eq("id", id);
  revalidatePath("/conversiones");
  return error ? { ok: false, message: dbMessage(error) } : { ok: true, message: "Eliminación deshecha." };
}
