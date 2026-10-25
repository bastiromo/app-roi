"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { accountSchema, approvalSchema, BULK_STATUSES, type BulkStatus } from "@/domain/schemas";
import { requireUser } from "@/lib/auth";
import { dbMessage, fieldErrors, type FormState, formValues } from "@/lib/form";

export async function saveAccount(id: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireUser();
  const values = formValues(form);
  const parsed = accountSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const data = parsed.data;
  if (data.origin_account_id) {
    if (data.origin_account_id === id) return { errors: { origin_account_id: "Una cuenta no puede originarse en sí misma." }, values };
    const { data: origin } = await supabase.from("accounts").select("firm_id,phase").eq("id", data.origin_account_id).maybeSingle();
    if (!origin || origin.firm_id !== data.firm_id || origin.phase !== "evaluacion") {
      return { errors: { origin_account_id: "Elige una evaluación de la misma empresa." }, values };
    }
    let taken = supabase.from("accounts").select("label").eq("origin_account_id", data.origin_account_id).is("deleted_at", null);
    if (id) taken = taken.neq("id", id);
    const { data: other } = await taken.maybeSingle();
    if (other) return { errors: { origin_account_id: `Esa evaluación ya está vinculada a ${other.label}.` }, values };
  }

  const { error } = id
    ? await supabase.from("accounts").update(data).eq("id", id)
    : await supabase.from("accounts").insert(data);
  if (error) return { message: dbMessage(error), values };

  revalidatePath("/cuentas");
  revalidatePath("/empresas");
  revalidatePath("/");
  redirect("/cuentas?guardado=1");
}

export async function approveEvaluation(evaluationId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireUser();
  const values = formValues(form);
  const parsed = approvalSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const { data: newId, error } = await supabase.rpc("approve_evaluation", {
    p_evaluation_id: evaluationId,
    p_label: parsed.data.label,
    p_external_id: parsed.data.external_id ?? "",
    p_approved_on: parsed.data.approved_on,
  });
  if (error) return { message: error.code === "23514" || error.code === "P0002" ? error.message : dbMessage(error), values };

  revalidatePath("/cuentas");
  revalidatePath("/empresas");
  redirect(`/cuentas/${newId}?aprobada=1`);
}

export interface DeleteResult {
  ok: boolean;
  message: string;
  ids?: string[];
}

export async function deleteAccounts(ids: string[]): Promise<DeleteResult> {
  const { supabase } = await requireUser();
  const clean = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (clean.length === 0) return { ok: false, message: "No seleccionaste ninguna cuenta." };
  const { data, error } = await supabase.rpc("delete_accounts", { p_ids: clean });
  if (error) return { ok: false, message: error.code === "23514" ? error.message : dbMessage(error) };
  revalidatePath("/cuentas");
  revalidatePath("/empresas");
  const n = Number(data ?? 0);
  return { ok: true, ids: clean, message: n === 1 ? "Cuenta eliminada." : `${n} cuentas eliminadas.` };
}

export async function restoreAccounts(ids: string[]): Promise<DeleteResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("restore_accounts", { p_ids: ids });
  if (error) return { ok: false, message: dbMessage(error) };
  revalidatePath("/cuentas");
  revalidatePath("/empresas");
  return { ok: true, message: "Eliminación deshecha." };
}


export interface StatusResult {
  ok: boolean;
  message: string;
  /** Estado anterior de cada cuenta, para deshacer. */
  previous?: { id: string; status: string; closed_on: string | null }[];
}

/**
 * Cambia el estado de varias cuentas a la vez. Perdida/Cerrada guardan la fecha de cierre
 * (nunca antes de la apertura de cada cuenta); Activa/Suspendida la borran.
 * El historial de estados se registra solo (trigger en la base).
 */
export async function setAccountsStatus(ids: string[], status: string, date: string): Promise<StatusResult> {
  const { supabase } = await requireUser();
  const clean = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (clean.length === 0) return { ok: false, message: "No seleccionaste ninguna cuenta." };
  if (!(BULK_STATUSES as readonly string[]).includes(status)) return { ok: false, message: "Estado no válido." };
  const closes = status === "perdida" || status === "cerrada";
  if (closes && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: "Elige la fecha de cierre o pérdida." };

  const { data: rows, error: readError } = await supabase
    .from("accounts")
    .select("id,status,opened_on,closed_on")
    .in("id", clean)
    .is("deleted_at", null)
    .returns<{ id: string; status: string; opened_on: string | null; closed_on: string | null }[]>();
  if (readError) return { ok: false, message: dbMessage(readError) };
  if (!rows?.length) return { ok: false, message: "No encontré esas cuentas." };

  // Agrupa por fecha de cierre resultante: una actualización por grupo
  const groups = new Map<string, string[]>();
  for (const r of rows) {
    const closedOn = closes ? (r.opened_on && r.opened_on > date ? r.opened_on : date) : "";
    groups.set(closedOn, [...(groups.get(closedOn) ?? []), r.id]);
  }
  for (const [closedOn, groupIds] of groups) {
    const { error } = await supabase
      .from("accounts")
      .update({ status: status as BulkStatus, closed_on: closedOn || null })
      .in("id", groupIds);
    if (error) return { ok: false, message: dbMessage(error) };
  }

  revalidatePath("/cuentas");
  revalidatePath("/empresas");
  revalidatePath("/");
  const label = { activa: "Activa", suspendida: "Suspendida", perdida: "Perdida", cerrada: "Cerrada" }[status as BulkStatus];
  return {
    ok: true,
    message: rows.length === 1 ? `Cuenta marcada como ${label}.` : `${rows.length} cuentas marcadas como ${label}.`,
    previous: rows.map((r) => ({ id: r.id, status: r.status, closed_on: r.closed_on })),
  };
}

/** Deshace un cambio de estado en grupo: devuelve a cada cuenta su estado y fecha anteriores. */
export async function restoreAccountsStatus(previous: { id: string; status: string; closed_on: string | null }[]): Promise<StatusResult> {
  const { supabase } = await requireUser();
  for (const p of previous) {
    if (!/^[0-9a-f-]{36}$/i.test(p.id)) continue;
    const { error } = await supabase
      .from("accounts")
      .update({ status: p.status, closed_on: p.closed_on })
      .eq("id", p.id);
    if (error) return { ok: false, message: dbMessage(error) };
  }
  revalidatePath("/cuentas");
  revalidatePath("/empresas");
  revalidatePath("/");
  return { ok: true, message: "Cambio de estado deshecho." };
}
