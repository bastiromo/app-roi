"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Button, Field, Notice, Select, TextArea } from "@/components/ui";
import { d } from "@/domain/money";
import { CURRENCIES, estimateReceived, PAYOUT_STATUS_LABEL, PAYOUT_STATUSES } from "@/domain/schemas";
import { suggestTraderShare } from "@/domain/split";
import { emptyForm, type FormState } from "@/lib/form";
import { lookupFx } from "../gastos/actions";
import { savePayout } from "./actions";

export interface PayoutFormDefaults {
  firm_id: string;
  account_id: string;
  status: string;
  requested_on: string;
  paid_on: string;
  requested_amount: string;
  trader_share_pct: string;
  transfer_fee: string;
  notes: string;
  receipt_mode: "estimated" | "actual";
  received_amount: string;
  received_currency: string;
  received_on: string;
  usd_rate: string;
  fx_usd_clp: string;
  fx_source: string;
  tx_hash: string;
}

export interface PayoutOptions {
  firms: { id: string; name: string; default_trader_share_pct: string; split_tier_threshold: string | null; split_tier_pct_before: string | null; default_transfer_fee: string; transfer_fee_is_estimate: boolean }[];
  accounts: { id: string; firm_id: string; label: string; phase: string; status: string }[];
  paid: { id: string; firm_id: string; requested_on: string; requested_amount: string }[];
}

const usd = new Intl.NumberFormat("es-CL", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const fxFormat = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Convierte lo que el usuario escribe ("2.000", "1.234,5") en número para mostrar cálculos en vivo. */
function loose(raw: string): string | null {
  const s = raw.trim().replace(/\s|US\$|\$|%/g, "");
  if (!s) return null;
  let n = s;
  if (s.includes(",") && s.includes(".")) n = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) n = s.replace(",", ".");
  else if ((s.match(/\./g) ?? []).length > 1 || /^[1-9]\d{0,2}\.\d{3}$/.test(s)) n = s.replace(/\./g, "");
  return /^\d+(\.\d+)?$/.test(n) ? n : null;
}

export function PayoutForm({ id, defaults, options }: { id: string | null; defaults: PayoutFormDefaults; options: PayoutOptions }) {
  const [state, action, pending] = useActionState<FormState, FormData>(savePayout.bind(null, id), emptyForm);
  const v = (k: keyof PayoutFormDefaults) => state.values?.[k] ?? defaults[k];
  const e = state.errors ?? {};

  const [firmId, setFirmId] = useState(v("firm_id"));
  const [status, setStatus] = useState(v("status"));
  const [requestedOn, setRequestedOn] = useState(v("requested_on"));
  const [amount, setAmount] = useState(v("requested_amount"));
  // null = usar la sugerencia de la empresa; texto = lo que escribió el usuario
  const [pctInput, setPctInput] = useState<string | null>(id || state.values ? v("trader_share_pct") : null);
  const [feeInput, setFeeInput] = useState<string | null>(id || state.values ? v("transfer_fee") : null);
  const [mode, setMode] = useState(v("receipt_mode"));
  const [currency, setCurrency] = useState(v("received_currency"));
  const [paidOn, setPaidOn] = useState(v("paid_on") || v("requested_on"));
  const [fx, setFx] = useState(v("fx_usd_clp"));
  const [fxSource, setFxSource] = useState(v("fx_source"));
  const [fxNote, setFxNote] = useState("");
  const fxTouched = useRef(Boolean(id) && defaults.fx_source === "manual");

  const firm = options.firms.find((f) => f.id === firmId);
  // Solo financiadas/live (una evaluación no tiene payouts). Al editar, se mantiene la cuenta ya guardada.
  // Activas primero; las demás muestran su estado.
  const accounts = options.accounts
    .filter((a) => a.firm_id === firmId && (a.phase !== "evaluacion" || a.id === defaults.account_id))
    .sort((a, b) => Number(b.status === "activa") - Number(a.status === "activa"));
  const paid = status === "paid";

  // Retirado antes de esta fecha en la empresa (para reglas por tramos como Apex)
  const withdrawnBefore = useMemo(
    () =>
      options.paid
        .filter((p) => p.firm_id === firmId && p.id !== id && p.requested_on <= requestedOn)
        .reduce((t, p) => t.add(d(p.requested_amount)), d(0))
        .toString(),
    [options.paid, firmId, id, requestedOn],
  );
  const amountNum = loose(amount);
  const suggestion =
    firm && amountNum && d(amountNum).gt(0)
      ? suggestTraderShare(
          { defaultTraderSharePct: firm.default_trader_share_pct, splitTierThreshold: firm.split_tier_threshold, splitTierPctBefore: firm.split_tier_pct_before },
          withdrawnBefore,
          amountNum,
        )
      : null;

  const pct = pctInput ?? (suggestion ? d(suggestion.pct).toString() : "");
  const fee = feeInput ?? (firm ? d(firm.default_transfer_fee).toString() : "");

  // Dólar observado de la fecha de pago
  useEffect(() => {
    if (!paid || !/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || fxTouched.current) return;
    let alive = true;
    setFxNote("Buscando dólar observado…");
    lookupFx(paidOn).then((r) => {
      if (!alive) return;
      if (r) {
        setFx(r.rate);
        setFxSource("dolar_observado");
        setFxNote(`Dólar observado del ${r.date.split("-").reverse().join("-")}: $${fxFormat.format(Number(r.rate))}`);
      } else setFxNote("No pude obtener el dólar observado. Escríbelo a mano.");
    });
    return () => {
      alive = false;
    };
  }, [paid, paidOn]);

  const pctNum = loose(pct);
  const feeNum = loose(fee) ?? "0";
  const share = amountNum && pctNum ? d(amountNum).mul(d(pctNum)).div(100) : null;
  const estimate = amountNum && pctNum ? estimateReceived(amountNum, pctNum, feeNum) : null;

  return (
    <form action={action} className="max-w-2xl space-y-8" noValidate>
      <fieldset className="space-y-4">
        <legend className="mb-2 font-semibold">Retiro</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Empresa"
            name="firm_id"
            value={firmId}
            onChange={(ev) => {
              setFirmId(ev.target.value);
              setPctInput(null);
              setFeeInput(null);
            }}
            error={e.firm_id}
          >
            <option value="">Elige la empresa</option>
            {options.firms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
          <Select label="Cuenta" name="account_id" defaultValue={v("account_id")} error={e.account_id} disabled={!firmId}>
            <option value="">
              {!firmId ? "Elige primero la empresa" : accounts.length ? "Elige la cuenta financiada" : "Esta empresa no tiene cuentas financiadas"}
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
                {a.phase === "evaluacion" ? " (evaluación)" : a.status !== "activa" ? ` (${a.status})` : ""}
              </option>
            ))}
          </Select>
          <Field label="Fecha de solicitud" name="requested_on" type="date" value={requestedOn} onChange={(ev) => setRequestedOn(ev.target.value)} error={e.requested_on} />
          <Field
            label="Monto retirado (USD)"
            name="requested_amount"
            inputMode="decimal"
            value={amount}
            onChange={(ev) => setAmount(ev.target.value)}
            error={e.requested_amount}
            hint="El que muestra la empresa, antes del reparto. Ej. 2.000"
          />
          <Field
            label="Tu porcentaje"
            name="trader_share_pct"
            inputMode="decimal"
            value={pct}
            onChange={(ev) => setPctInput(ev.target.value)}
            error={e.trader_share_pct}
            hint={suggestion ? `Sugerido: ${suggestion.explanation}` : "Se sugiere según la regla de la empresa."}
          />
          <Select label="Estado" name="status" value={status} onChange={(ev) => setStatus(ev.target.value)}>
            {PAYOUT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PAYOUT_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
        {share && (
          <p className="num text-sm text-ink-2">
            Te corresponde <strong className="text-ink">{usd.format(Number(share.toFixed(2)))}</strong>
            {!paid && " (aún no cuenta como recibido)"}
          </p>
        )}
      </fieldset>

      {paid && (
        <fieldset className="space-y-4">
          <legend className="mb-2 font-semibold">Lo que llegó</legend>
          <div className="inline-flex rounded-full bg-surface-2 p-1" role="radiogroup" aria-label="Monto recibido">
            {(
              [
                ["estimated", "Usar estimado"],
                ["actual", "Sé el monto exacto"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className={`cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition-colors ${mode === k ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink"}`}>
                <input type="radio" name="receipt_mode" value={k} checked={mode === k} onChange={() => setMode(k)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha de pago" name="paid_on" type="date" value={paidOn} onChange={(ev) => setPaidOn(ev.target.value)} error={e.paid_on} />
            {mode === "estimated" ? (
              <Field
                label="Comisión de transferencia (USD)"
                name="transfer_fee"
                inputMode="decimal"
                value={fee}
                onChange={(ev) => setFeeInput(ev.target.value)}
                error={e.transfer_fee}
                hint={firm?.transfer_fee_is_estimate ? "Valor estimado de la empresa." : "Valor confirmado de la empresa."}
              />
            ) : (
              <>
                <Field label="Monto recibido" name="received_amount" inputMode="decimal" defaultValue={v("received_amount")} error={e.received_amount} />
                <Select label="Moneda recibida" name="received_currency" value={currency} onChange={(ev) => setCurrency(ev.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
                {(currency === "USDT" || currency === "USDC") && (
                  <Field label={`Valor de 1 ${currency} en USD`} name="usd_rate" inputMode="decimal" defaultValue={v("usd_rate") || "1"} error={e.usd_rate} />
                )}
                <Field label="Hash de transacción (opcional)" name="tx_hash" defaultValue={v("tx_hash")} error={e.tx_hash} />
              </>
            )}
            <Field
              label="Dólar en pesos (CLP por 1 USD)"
              name="fx_usd_clp"
              inputMode="decimal"
              value={fx}
              onChange={(ev) => {
                fxTouched.current = true;
                setFx(ev.target.value);
                setFxSource("manual");
                setFxNote("Valor escrito a mano.");
              }}
              error={e.fx_usd_clp}
              hint={fxNote || "Del día en que llegó el dinero."}
            />
            <input type="hidden" name="fx_source" value={fxSource} />
          </div>

          {mode === "estimated" && estimate && (
            <p className="num rounded-lg border border-dashed border-estimate/50 px-3 py-2 text-sm text-ink-2">
              Llegará aprox. <span className="est font-semibold">{usd.format(Number(estimate))}</span> ({amount} × {pct} % − {fee || 0} de
              comisión). Se guardará como estimado; si después sabes el monto exacto, edítalo.
            </p>
          )}
        </fieldset>
      )}
      {!paid && <input type="hidden" name="transfer_fee" value={fee} />}

      <TextArea label="Notas" name="notes" defaultValue={v("notes")} rows={2} />

      {state.message && <Notice tone="error">{state.message}</Notice>}
      {Object.keys(e).length > 0 && !state.message && <Notice tone="error">Revisa los campos marcados.</Notice>}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar payout"}
        </Button>
        <Link href="/payouts" className="inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold text-ink-2 hover:text-ink">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
