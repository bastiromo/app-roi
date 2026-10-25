"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Field, Notice } from "@/components/ui";
import { emptyForm, type FormState } from "@/lib/form";
import { approveEvaluation } from "../../actions";

export function ApproveForm({ evaluationId, minDate }: { evaluationId: string; minDate: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(approveEvaluation.bind(null, evaluationId), emptyForm);
  const e = state.errors ?? {};
  const v = state.values ?? {};
  return (
    <form action={action} className="max-w-xl space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre de la cuenta financiada" name="label" defaultValue={v.label} error={e.label} hint="Ej. PRO001" autoFocus />
        <Field label="ID de la empresa (opcional)" name="external_id" defaultValue={v.external_id} hint="Ej. LFF050-0BY89NW5-PRO008" />
        <Field
          label="Fecha de aprobación"
          name="approved_on"
          type="date"
          min={minDate ?? undefined}
          defaultValue={v.approved_on ?? new Date().toISOString().slice(0, 10)}
          error={e.approved_on}
        />
      </div>
      {state.message && <Notice tone="error">{state.message}</Notice>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear cuenta financiada"}
        </Button>
        <Link href={`/cuentas/${evaluationId}`} className="inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold text-ink-2 hover:text-ink">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
