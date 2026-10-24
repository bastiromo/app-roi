"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button, Check, Field, Notice, TextArea } from "@/components/ui";
import { emptyForm, type FormState } from "@/lib/form";
import { saveFirm } from "./actions";

export interface FirmFormDefaults {
  name: string;
  website: string;
  default_trader_share_pct: string;
  split_tier_threshold: string;
  split_tier_pct_before: string;
  default_transfer_fee: string;
  transfer_fee_is_estimate: boolean;
  payout_rules_notes: string;
  notes: string;
  is_active: boolean;
  is_configured: boolean;
}

export function FirmForm({ id, defaults }: { id: string | null; defaults: FirmFormDefaults }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveFirm.bind(null, id), emptyForm);
  const v = (k: keyof FirmFormDefaults) => state.values?.[k] ?? String(defaults[k] ?? "");
  const e = state.errors ?? {};
  const [hasTier, setHasTier] = useState(Boolean(defaults.split_tier_threshold));

  return (
    <form action={action} className="max-w-2xl space-y-8" noValidate>
      {!defaults.is_configured && id && (
        <Notice>Empresa de catálogo, aún sin configurar. Al guardar, la app usará estas reglas para estimar tus payouts.</Notice>
      )}

      <fieldset className="space-y-4">
        <legend className="mb-2 font-semibold">Datos</legend>
        <Field label="Nombre" name="name" defaultValue={v("name")} error={e.name} required />
        <Field label="Sitio web" name="website" type="url" placeholder="https://" defaultValue={v("website")} error={e.website} />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 font-semibold">Reparto de beneficios</legend>
        <p className="text-sm text-ink-2">
          Se usa para <span className="est">sugerir</span> cuánto te corresponde de cada retiro. El valor que confirmes en cada
          payout queda guardado en ese payout, aunque cambies esta regla después.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={hasTier ? "Tu porcentaje después del umbral" : "Tu porcentaje"}
            name="default_trader_share_pct"
            inputMode="decimal"
            defaultValue={v("default_trader_share_pct")}
            error={e.default_trader_share_pct}
            hint="Ej. 90"
          />
        </div>
        <Check
          label="El porcentaje cambia según cuánto he retirado"
          hint="Ej. Apex: 100 % hasta USD 25.000 retirados en total, luego 90 %."
          name="has_tier"
          checked={hasTier}
          onChange={(ev) => setHasTier(ev.target.checked)}
        />
        {hasTier && (
          <div className="grid gap-4 border-l-2 border-line pl-4 sm:grid-cols-2">
            <Field
              label="Porcentaje inicial"
              name="split_tier_pct_before"
              inputMode="decimal"
              defaultValue={v("split_tier_pct_before")}
              error={e.split_tier_pct_before}
              hint="Ej. 100"
            />
            <Field
              label="Hasta haber retirado (USD)"
              name="split_tier_threshold"
              inputMode="decimal"
              defaultValue={v("split_tier_threshold")}
              error={e.split_tier_threshold}
              hint="Suma de retiros brutos en esta empresa. Ej. 25.000"
            />
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 font-semibold">Comisión por retiro</legend>
        <p className="text-sm text-ink-2">Lo que se descuenta en cada payout hasta que llega a tu billetera o cuenta.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Monto fijo por payout (USD)"
            name="default_transfer_fee"
            inputMode="decimal"
            defaultValue={v("default_transfer_fee")}
            error={e.default_transfer_fee}
          />
        </div>
        <Check
          label="Es un valor estimado"
          hint="Márcalo mientras no hayas confirmado la comisión real."
          name="transfer_fee_is_estimate"
          defaultChecked={state.values ? state.values.transfer_fee_is_estimate === "on" : defaults.transfer_fee_is_estimate}
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 font-semibold">Notas</legend>
        <TextArea label="Reglas de payout" name="payout_rules_notes" defaultValue={v("payout_rules_notes")} hint="Mínimos, consistencia, frecuencia…" />
        <TextArea label="Notas" name="notes" defaultValue={v("notes")} />
        <Check
          label="La uso actualmente"
          hint="Las empresas inactivas no aparecen al crear cuentas."
          name="is_active"
          defaultChecked={state.values ? state.values.is_active === "on" : defaults.is_active}
        />
      </fieldset>

      {state.message && <Notice tone="error">{state.message}</Notice>}
      {Object.keys(e).length > 0 && !state.message && <Notice tone="error">Revisa los campos marcados.</Notice>}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar empresa"}
        </Button>
        <Link href="/empresas" className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-semibold text-ink-2 hover:text-ink">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
