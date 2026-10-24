"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button, Field, Notice, Select, TextArea } from "@/components/ui";
import { PHASE_LABEL, PHASES, STATUS_LABEL, STATUSES } from "@/domain/schemas";
import { emptyForm, type FormState } from "@/lib/form";
import { saveAccount } from "./actions";

export interface AccountFormDefaults {
  firm_id: string;
  label: string;
  external_id: string;
  plan_name: string;
  nominal_size: string;
  phase: string;
  status: string;
  origin_account_id: string;
  opened_on: string;
  closed_on: string;
  notes: string;
}

interface Options {
  firms: { id: string; name: string; is_active: boolean; is_configured: boolean }[];
  accounts: { id: string; firm_id: string; label: string; phase: string }[];
}

export function AccountForm({ id, defaults, options }: { id: string | null; defaults: AccountFormDefaults; options: Options }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAccount.bind(null, id), emptyForm);
  const v = (k: keyof AccountFormDefaults) => state.values?.[k] ?? defaults[k];
  const e = state.errors ?? {};
  const [firmId, setFirmId] = useState(v("firm_id"));
  const [status, setStatus] = useState(v("status"));
  const [phase, setPhase] = useState(v("phase"));

  // Empresas usables: configuradas y activas, más la actual aunque esté inactiva.
  const firms = options.firms.filter((f) => (f.is_configured && f.is_active) || f.id === defaults.firm_id);
  const origins = options.accounts.filter((a) => a.firm_id === firmId && a.id !== id && a.phase === "evaluacion");
  const needsClose = status === "cerrada" || status === "perdida";

  return (
    <form action={action} className="max-w-2xl space-y-8" noValidate>
      <fieldset className="space-y-4">
        <legend className="mb-2 font-semibold">Cuenta</legend>
        <Select label="Empresa" name="firm_id" value={firmId} onChange={(ev) => setFirmId(ev.target.value)} error={e.firm_id}>
          <option value="">Elige una empresa</option>
          {firms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" name="label" defaultValue={v("label")} error={e.label} hint="Cómo la reconoces. Ej. PRO008" />
          <Field label="ID de la empresa" name="external_id" defaultValue={v("external_id")} error={e.external_id} hint="Ej. LFF050-0BY89NW5-PRO008" />
          <Field label="Plan" name="plan_name" defaultValue={v("plan_name")} hint="Ej. LucidFlex 50K Rithmic" />
          <Field
            label="Tamaño nominal (USD)"
            name="nominal_size"
            inputMode="decimal"
            defaultValue={v("nominal_size")}
            error={e.nominal_size}
            hint="Solo referencia: no es dinero tuyo y no entra en el ROI."
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 font-semibold">Situación</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Fase" name="phase" value={phase} onChange={(ev) => setPhase(ev.target.value)} error={e.phase}>
            {PHASES.map((p) => (
              <option key={p} value={p}>
                {PHASE_LABEL[p]}
              </option>
            ))}
          </Select>
          <Select label="Estado" name="status" value={status} onChange={(ev) => setStatus(ev.target.value)} error={e.status}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Field label="Fecha de apertura" name="opened_on" type="date" defaultValue={v("opened_on")} error={e.opened_on} />
          <Field
            label={needsClose ? "Fecha de cierre o pérdida" : "Fecha de cierre (opcional)"}
            name="closed_on"
            type="date"
            defaultValue={v("closed_on")}
            error={e.closed_on}
          />
        </div>
        {phase !== "evaluacion" && (
          <Select
            label="Evaluación de origen"
            name="origin_account_id"
            defaultValue={v("origin_account_id")}
            error={e.origin_account_id}
            disabled={!firmId}
            hint="La evaluación que aprobaste para obtener esta cuenta (ej. TEST-1234 → PRO001). Lo que pagaste por ella se cuenta en el ROI de esta cuenta."
          >
            <option value="">Sin vincular</option>
            {origins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} ({PHASE_LABEL[a.phase as keyof typeof PHASE_LABEL]})
              </option>
            ))}
          </Select>
        )}
        <TextArea label="Notas" name="notes" defaultValue={v("notes")} />
      </fieldset>

      {state.message && <Notice tone="error">{state.message}</Notice>}
      {Object.keys(e).length > 0 && !state.message && <Notice tone="error">Revisa los campos marcados.</Notice>}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar cuenta"}
        </Button>
        <Link href="/cuentas" className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-semibold text-ink-2 hover:text-ink">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
