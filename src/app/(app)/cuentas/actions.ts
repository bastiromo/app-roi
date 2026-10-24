"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { accountSchema } from "@/domain/schemas";
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
    const { data: origin } = await supabase.from("accounts").select("firm_id").eq("id", data.origin_account_id).maybeSingle();
    if (!origin || origin.firm_id !== data.firm_id) {
      return { errors: { origin_account_id: "La cuenta de origen debe ser de la misma empresa." }, values };
    }
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
