"use client";

import { useActionState, useState } from "react";
import { Button, Field, Notice, Select } from "@/components/ui";
import { d } from "@/domain/money";
import { parseDecimalInput } from "@/domain/schemas";
import type { FormState } from "@/lib/form";
import { saveConversion } from "./actions";

type State = FormState & { n: number };

const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 2 });

export function ConversionForm({ today, lastLabel }: { today: string; lastLabel: string }) {
  const [state, action, pending] = useActionState<State, FormData>(async (prev, fd) => {
    const r = await saveConversion(prev, fd);
    // Si se guardó (sin valores devueltos), n cambia y el formulario se vacía
    return { ...r, n: prev.n + (r.values ? 0 : 1) };
  }, { n: 0 });
  const ok = Boolean(state.message && !state.values && !state.errors);

  return (
    <section aria-labelledby="nueva-venta" className="space-y-4 rounded-xl border border-line bg-surface p-5 md:p-6">
      <h2 id="nueva-venta" className="font-semibold">
        Registrar una venta
      </h2>
      {state.message && <Notice tone={ok ? "success" : "error"}>{state.message}</Notice>}
      <Fields key={state.n} state={state} action={action} pending={pending} today={today} lastLabel={lastLabel} />
    </section>
  );
}

function Fields(props: { state: State; action: (fd: FormData) => void; pending: boolean; today: string; lastLabel: string }) {
  const { state, action, pending } = props;
  const v = state.values ?? {};
  const e = state.errors ?? {};
  const [crypto, setCrypto] = useState(v.from_amount ?? "");
  const [pesos, setPesos] = useState(v.to_amount ?? "");
  const [coin, setCoin] = useState(v.from_currency ?? "USDT");

  const c = parseDecimalInput(crypto);
  const p = parseDecimalInput(pesos);
  const price = c && p && c !== "NaN" && p !== "NaN" && d(c).gt(0) ? d(p).div(d(c)) : null;

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Fecha de la venta" name="converted_on" type="date" required defaultValue={v.converted_on ?? props.today} error={e.converted_on} />
      <Select label="Cripto vendida" name="from_currency" value={coin} onChange={(ev) => setCoin(ev.target.value)}>
        <option value="USDT">USDT</option>
        <option value="USDC">USDC</option>
      </Select>
      <Field
        label={`${coin} vendidos`}
        name="from_amount"
        inputMode="decimal"
        required
        value={crypto}
        onChange={(ev) => setCrypto(ev.target.value)}
        error={e.from_amount}
        hint="Lo que entregaste al comprador."
      />
      <Field
        label="Pesos recibidos"
        name="to_amount"
        inputMode="decimal"
        required
        value={pesos}
        onChange={(ev) => setPesos(ev.target.value)}
        error={e.to_amount}
        hint={price ? `Precio: ${clp.format(Number(price.toFixed(2)))} por ${coin}` : "Lo que llegó a tu cuenta bancaria."}
      />
      <Field
        label="Comisión (opcional)"
        name="fee_amount"
        inputMode="decimal"
        defaultValue={v.fee_amount ?? ""}
        error={e.fee_amount}
        hint="En P2P normalmente no hay; déjalo vacío."
      />
      <Select label="La comisión se cobró en" name="fee_currency" defaultValue={v.fee_currency ?? "CRYPTO"}>
        <option value="CRYPTO">{coin}</option>
        <option value="CLP">Pesos</option>
      </Select>
      <Field label="Dónde vendiste" name="exchange_label" defaultValue={v.exchange_label ?? props.lastLabel} hint="Ej. Binance P2P." />
      <Field label="N.º de orden (opcional)" name="tx_ref" defaultValue={v.tx_ref ?? ""} error={e.tx_ref} hint="Evita registrar la misma venta dos veces." />
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar venta"}
        </Button>
      </div>
    </form>
  );
}
