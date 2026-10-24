"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { firmSchema } from "@/domain/schemas";
import { requireUser } from "@/lib/auth";
import { dbMessage, fieldErrors, type FormState, formValues } from "@/lib/form";

export async function saveFirm(id: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireUser();
  const values = formValues(form);
  const parsed = firmSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const { error } = id
    ? await supabase.from("firms").update(parsed.data).eq("id", id)
    : await supabase.from("firms").insert(parsed.data);
  if (error) return { message: dbMessage(error), values };

  revalidatePath("/empresas");
  redirect("/empresas?guardado=1");
}
