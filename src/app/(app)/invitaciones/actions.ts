"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { dbMessage, type FormState } from "@/lib/form";

const emailSchema = z.email("Escribe un correo válido.");

export async function createInvitation(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, user } = await requireUser();
  const raw = String(form.get("email") ?? "").trim().toLowerCase();
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) return { errors: { email: parsed.error.issues[0].message }, values: { email: raw } };
  if (parsed.data === user.email.toLowerCase()) return { errors: { email: "Ese es tu propio correo." }, values: { email: raw } };

  const { error } = await supabase.from("invitations").insert({ email: parsed.data, invited_by: user.id });
  if (error) {
    if (error.code === "23505") return { errors: { email: "Ya hay una invitación pendiente para ese correo." }, values: { email: raw } };
    if (error.code === "42501") return { message: "Solo el administrador puede invitar." };
    return { message: dbMessage(error), values: { email: raw } };
  }
  revalidatePath("/invitaciones");
  return { message: `Invitación creada para ${parsed.data}.` };
}

export async function deleteInvitation(id: string): Promise<void> {
  const { supabase } = await requireUser();
  await supabase.from("invitations").delete().eq("id", id);
  revalidatePath("/invitaciones");
}
