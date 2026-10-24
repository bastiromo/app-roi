"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { d } from "@/domain/money";
import { batchAccountLabels, expenseSchema } from "@/domain/schemas";
import { requireUser } from "@/lib/auth";
import { dbMessage, fieldErrors, type FormState, formValues } from "@/lib/form";
import { type FxLookup, lookupUsdClp } from "@/lib/fx";

function shiftDate(iso: string, days: number) {
  const t = new Date(`${iso}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

export async function lookupFx(isoDate: string): Promise<FxLookup | null> {
  return lookupUsdClp(isoDate);
}

export async function saveExpense(id: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireUser();
  const values = formValues(form);
  const parsed = expenseSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const { data, confirmDuplicate, batch } = parsed.data;
  if (id && batch.quantity > 1) return { errors: { quantity: "Al editar se modifica un solo gasto." }, values };

  // Cuenta debe pertenecer a la empresa elegida
  if (data.account_id) {
    const { data: acc } = await supabase.from("accounts").select("firm_id").eq("id", data.account_id).maybeSingle();
    if (!acc || acc.firm_id !== data.firm_id) return { errors: { account_id: "Esa cuenta no es de la empresa elegida." }, values };
  }

  // Reembolso: hereda la empresa del gasto original y no puede superarlo
  if (data.kind === "refund" && data.refund_of_id) {
    const { data: orig } = await supabase
      .from("expenses")
      .select("firm_id,account_id,amount::text,currency")
      .eq("id", data.refund_of_id)
      .maybeSingle<{ firm_id: string | null; account_id: string | null; amount: string; currency: string }>();
    if (!orig) return { errors: { refund_of_id: "No encontré el gasto original." }, values };
    if (orig.currency === data.currency && d(data.amount!).gt(d(orig.amount))) {
      return { errors: { amount: `El reembolso no puede superar el gasto original (${orig.amount} ${orig.currency}).` }, values };
    }
    data.firm_id = orig.firm_id;
    data.account_id = orig.account_id;
  }

  // Posible duplicado: misma empresa, monto y moneda, ±2 días (solo si no hay n.º de orden ni hash)
  if (!confirmDuplicate && data.kind === "cost" && batch.refs.length === 0 && !data.tx_hash) {
    let q = supabase
      .from("expenses")
      .select("occurred_on,description")
      .eq("amount", data.amount!)
      .eq("currency", data.currency)
      .eq("kind", "cost")
      .gte("occurred_on", shiftDate(data.occurred_on, -2))
      .lte("occurred_on", shiftDate(data.occurred_on, 2))
      .is("deleted_at", null);
    q = data.firm_id ? q.eq("firm_id", data.firm_id) : q.is("firm_id", null);
    if (id) q = q.neq("id", id);
    const { data: similar } = await q.limit(1).maybeSingle<{ occurred_on: string; description: string | null }>();
    if (similar) {
      return {
        values,
        warning: `Ya registraste un gasto igual el ${similar.occurred_on}${similar.description ? ` (${similar.description})` : ""}. Si ${batch.quantity > 1 ? "estas son otras compras" : "es otro gasto distinto"}, marca la casilla y guarda de nuevo.`,
      };
    }
  }

  if (id) {
    const { error } = await supabase.from("expenses").update({ ...data, external_ref: batch.refs[0] ?? null }).eq("id", id);
    if (error) return insertError(error, values);
  } else {
    // Cuentas de evaluación, una por compra (opcional)
    let accountIds: (string | null)[] = Array(batch.quantity).fill(data.account_id);
    let createdAccounts: string[] = [];
    if (batch.accounts) {
      const labels = batchAccountLabels(batch.accounts.prefix, batch.accounts.start, batch.quantity);
      const { data: created, error } = await supabase
        .from("accounts")
        .insert(labels.map((label) => ({ firm_id: data.firm_id, label, plan_name: data.description, phase: "evaluacion", status: "activa", opened_on: data.occurred_on })))
        .select("id,label");
      if (error || !created) return { message: dbMessage(error ?? { message: "sin respuesta" }), values };
      const byLabel = new Map(created.map((c) => [c.label, c.id as string]));
      accountIds = labels.map((l) => byLabel.get(l) ?? null);
      createdAccounts = created.map((c) => c.id as string);
    }
    const rows = Array.from({ length: batch.quantity }, (_, i) => ({
      ...data,
      account_id: accountIds[i],
      external_ref: batch.refs[i] ?? null,
      source: batch.quantity > 1 ? "manual-lote" : "manual",
    }));
    const { error } = await supabase.from("expenses").insert(rows); // una sola sentencia: todo o nada
    if (error) {
      // Compensa: si los gastos no se guardaron, las cuentas recién creadas no deben quedar.
      if (createdAccounts.length) await supabase.rpc("delete_accounts", { p_ids: createdAccounts });
      return insertError(error, values);
    }
    revalidatePath("/cuentas");
    revalidatePath("/gastos");
    revalidatePath("/");
    redirect(`/gastos?guardado=${batch.quantity}${batch.accounts ? "&cuentas=1" : ""}`);
  }

  revalidatePath("/gastos");
  revalidatePath("/");
  redirect("/gastos?guardado=1");
}

function insertError(error: { code?: string; message: string }, values: Record<string, string>): FormState {
  if (error.code === "23505") {
    const field = error.message.includes("tx_hash") ? "tx_hash" : "external_ref";
    return {
      errors: { [field]: field === "tx_hash" ? "Ese hash de transacción ya está registrado." : "Uno de esos n.º de orden ya está registrado en esta empresa." },
      values,
    };
  }
  return { message: dbMessage(error), values };
}

export interface ExpenseDeleteResult {
  ok: boolean;
  message: string;
  ids?: string[];
}

export async function deleteExpenses(ids: string[]): Promise<ExpenseDeleteResult> {
  const { supabase } = await requireUser();
  const clean = ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (clean.length === 0) return { ok: false, message: "No seleccionaste ningún gasto." };
  const { data: refunds } = await supabase
    .from("expenses")
    .select("refund_of_id")
    .in("refund_of_id", clean)
    .is("deleted_at", null)
    .not("id", "in", `(${clean.join(",")})`);
  if (refunds && refunds.length > 0) {
    return { ok: false, message: "Uno de los gastos tiene un reembolso registrado. Elimina primero el reembolso, o ambos juntos." };
  }
  const { error, count } = await supabase
    .from("expenses")
    .update({ deleted_at: new Date().toISOString() }, { count: "exact" })
    .in("id", clean)
    .is("deleted_at", null);
  if (error) return { ok: false, message: dbMessage(error) };
  revalidatePath("/gastos");
  revalidatePath("/");
  const n = count ?? clean.length;
  return { ok: true, ids: clean, message: n === 1 ? "Gasto eliminado." : `${n} gastos eliminados.` };
}

export async function restoreExpenses(ids: string[]): Promise<ExpenseDeleteResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("expenses").update({ deleted_at: null }).in("id", ids);
  if (error) return { ok: false, message: dbMessage(error) };
  revalidatePath("/gastos");
  revalidatePath("/");
  return { ok: true, message: "Eliminación deshecha." };
}
