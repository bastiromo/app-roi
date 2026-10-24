"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button, Check, Field, Notice, Select } from "@/components/ui";
import { d } from "@/domain/money";
import { CATEGORIES, CATEGORY_LABEL, CURRENCIES, EXPENSE_STATUS_LABEL, EXPENSE_STATUSES } from "@/domain/schemas";
import { emptyForm, type FormState } from "@/lib/form";
import { lookupFx, saveExpense } from "./actions";

export interface ExpenseFormDefaults {
  kind: "cost" | "refund";
  refund_of_id: string;
  status: string;
  occurred_on: string;
  firm_id: string;
  account_id: string;
  category: string;
  description: string;
  amount: string;
  currency: string;
  usd_rate: string;
  fx_usd_clp: string;
  fx_source: string;
  external_ref: string;
  tx_hash: string;
}

interface Options {
  firms: { id: string; name: string }[];
  accounts: { id: string; firm_id: string; label: string }[];
  costs: { id: string; firm_id: string | null; occurred_on: string; amount: string; currency: string; description: string | null; category: string }[];
}

const fxFormat = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ExpenseForm({ id, defaults, options }: { id: string | null; defaults: ExpenseFormDefaults; options: Options }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveExpense.bind(null, id), emptyForm);
  const v = (k: keyof ExpenseFormDefaults) => state.values?.[k] ?? defaults[k];
  const e = state.errors ?? {};

  const [kind, setKind] = useState(v("kind"));
  const [firmId, setFirmId] = useState(v("firm_id"));
  const [currency, setCurrency] = useState(v("currency"));
  const [date, setDate] = useState(v("occurred_on"));
  const [fx, setFx] = useState(v("fx_usd_clp"));
  const [fxSource, setFxSource] = useState(v("fx_source"));
  const [fxNote, setFxNote] = useState<string>("");
  const userTypedFx = useRef(Boolean(id) && defaults.fx_source === "manual");

  // Al cambiar la fecha, sugiere el dólar observado (si el usuario no lo escribió a mano).
  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || userTypedFx.current) return;
    let alive = true;
    setFxNote("Buscando dólar observado…");
    lookupFx(date).then((r) => {
      if (!alive) return;
      if (r) {
        setFx(r.rate);
        setFxSource("dolar_observado");
        setFxNote(`Dólar observado del ${r.date.split("-").reverse().join("-")}: $${fxFormat.format(Number(r.rate))}`);
      } else {
        setFxNote("No pude obtener el dólar observado. Escríbelo a mano.");
      }
    });
    return () => {
      alive = false;
    };
  }, [date]);

  const accounts = options.accounts.filter((a) => a.firm_id === firmId);
  const refundable = options.costs.filter((c) => !firmId || c.firm_id === firmId);
  const stable = currency === "USDT" || currency === "USDC";

  return (
    <form action={action} className="max-w-2xl space-y-8" noValidate>
      <fieldset className="space-y-4">
        <legend className="sr-only">Tipo</legend>
        <div className="inline-flex rounded-lg border border-line bg-surface p-1" role="radiogroup" aria-label="Tipo de movimiento">
          {(["cost", "refund"] as const).map((k) => (
            <label key={k} className={`cursor-pointer rounded-md px-4 py-2 text-sm font-medium ${kind === k ? "bg-ink text-bg" : "text-ink-2"}`}>
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {k === "cost" ? "Gasto" : "Reembolso recibido"}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 font-semibold">{kind === "cost" ? "Qué pagaste" : "Qué te devolvieron"}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fecha" name="occurred_on" type="date" value={date} onChange={(ev) => setDate(ev.target.value)} error={e.occurred_on} />
          <Select label="Empresa" name="firm_id" value={firmId} onChange={(ev) => setFirmId(ev.target.value)} error={e.firm_id}>
            <option value="">General (no es de una empresa)</option>
            {options.firms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
          {kind === "refund" ? (
            <div className="sm:col-span-2">
              <Select label="Gasto reembolsado" name="refund_of_id" defaultValue={v("refund_of_id")} error={e.refund_of_id}>
                <option value="">Elige el gasto</option>
                {refundable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.occurred_on}, {CATEGORY_LABEL[c.category as keyof typeof CATEGORY_LABEL] ?? c.category}, {d(c.amount).toString()} {c.currency}
                    {c.description ? ` (${c.description})` : ""}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <Select
              label="Cuenta (opcional)"
              name="account_id"
              defaultValue={v("account_id")}
              error={e.account_id}
              disabled={!firmId}
              hint={firmId ? "Vincula el gasto a una cuenta para ver su ROI por cuenta." : "Elige primero la empresa."}
            >
              <option value="">Sin cuenta</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          )}
          <Select label="Categoría" name="category" defaultValue={v("category")} error={e.category}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </div>
        <Field label="Descripción" name="description" defaultValue={v("description")} hint="Ej. LucidFlex 50K Rithmic" />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 font-semibold">Monto</legend>
        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <Field label="Monto" name="amount" inputMode="decimal" defaultValue={v("amount")} error={e.amount} hint="Usa coma para decimales: 105,20" />
          <Select label="Moneda" name="currency" value={currency} onChange={(ev) => setCurrency(ev.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        {stable && (
          <Field
            label={`Valor de 1 ${currency} en USD`}
            name="usd_rate"
            inputMode="decimal"
            defaultValue={v("usd_rate") || "1"}
            error={e.usd_rate}
            hint="Normalmente 1. Cámbialo solo si la stablecoin estaba desviada."
          />
        )}
        <Field
          label="Dólar en pesos (CLP por 1 USD)"
          name="fx_usd_clp"
          inputMode="decimal"
          value={fx}
          onChange={(ev) => {
            userTypedFx.current = true;
            setFx(ev.target.value);
            setFxSource("manual");
            setFxNote("Valor escrito a mano.");
          }}
          error={e.fx_usd_clp}
          hint={fxNote || "Se guarda con el movimiento: si el dólar cambia después, tu historial no se altera."}
        />
        <input type="hidden" name="fx_source" value={fxSource} />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 font-semibold">Comprobante</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="N.º de orden" name="external_ref" defaultValue={v("external_ref")} error={e.external_ref} hint="Evita registrar dos veces la misma compra." />
          <Field label="Hash de transacción (cripto)" name="tx_hash" defaultValue={v("tx_hash")} error={e.tx_hash} />
          <Select label="Estado" name="status" defaultValue={v("status")} hint="Solo los pagados cuentan en el ROI.">
            {EXPENSE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {EXPENSE_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
      </fieldset>

      {state.warning && (
        <div className="space-y-3 rounded-lg border border-estimate/50 p-3">
          <p role="alert" className="text-sm text-estimate">{state.warning}</p>
          <Check label="Sí, es otro gasto distinto" name="confirm_duplicate" />
        </div>
      )}
      {state.message && <Notice tone="error">{state.message}</Notice>}
      {Object.keys(e).length > 0 && !state.message && <Notice tone="error">Revisa los campos marcados.</Notice>}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : kind === "cost" ? "Guardar gasto" : "Guardar reembolso"}
        </Button>
        <Link href="/gastos" className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-semibold text-ink-2 hover:text-ink">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
