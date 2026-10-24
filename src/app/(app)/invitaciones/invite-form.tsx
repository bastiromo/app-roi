"use client";

import { useActionState } from "react";
import { Button, Field, Notice } from "@/components/ui";
import { emptyForm, type FormState } from "@/lib/form";
import { createInvitation } from "./actions";

export function InviteForm({ registerUrl }: { registerUrl: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createInvitation, emptyForm);
  const ok = state.message && !state.errors && state.message.startsWith("Invitación creada");
  return (
    <form action={action} className="max-w-xl space-y-4 rounded-xl border border-line bg-surface p-4 md:p-6" noValidate>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Correo de la persona" name="email" type="email" defaultValue={ok ? "" : state.values?.email} error={state.errors?.email} key={ok ? state.message : "f"} />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Invitando…" : "Invitar"}
        </Button>
      </div>
      {state.message && <Notice tone={ok ? "success" : "error"}>{state.message}</Notice>}
      {ok && (
        <p className="text-sm text-ink-2">
          Envíale este enlace para que cree su cuenta con ese mismo correo:{" "}
          <span className="break-all font-medium text-ink">{registerUrl}</span>
        </p>
      )}
    </form>
  );
}
