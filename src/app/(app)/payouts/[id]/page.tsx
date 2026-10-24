import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { inputNumber } from "@/lib/format";
import { getPayout, payoutFormOptions } from "../data";
import { PayoutForm } from "../payout-form";

export const metadata: Metadata = { title: "Editar payout" };

export default async function EditPayoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [found, options] = await Promise.all([getPayout(id), payoutFormOptions()]);
  if (!found) notFound();
  const { payout: p, receipt: r } = found;
  const estimated = !r || r.basis === "estimated";
  const firmFee = options.firms.find((f) => f.id === p.firm_id)?.default_transfer_fee ?? null;

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Payout de ${p.accounts?.label ?? "cuenta"}`}
        description={`${p.firms?.name ?? ""}. Un payout pagado no puede volver a solicitado o rechazado; si fue un error, elimínalo.`}
      />
      <PayoutForm
        id={p.id}
        options={options}
        defaults={{
          firm_id: p.firm_id,
          account_id: p.account_id,
          status: p.status === "draft" ? "requested" : p.status,
          requested_on: p.requested_on,
          paid_on: p.paid_on ?? "",
          requested_amount: inputNumber(p.requested_amount),
          trader_share_pct: inputNumber(p.trader_share_pct),
          transfer_fee: r && estimated ? inputNumber(r.processor_fee) : inputNumber(firmFee),
          notes: p.notes ?? "",
          receipt_mode: estimated ? "estimated" : "actual",
          received_amount: r && !estimated ? inputNumber(r.amount) : "",
          received_currency: r && !estimated ? r.currency : "USDT",
          received_on: r?.received_on ?? "",
          usd_rate: r ? inputNumber(r.usd_rate) : "",
          fx_usd_clp: r ? inputNumber(r.fx_usd_clp) : "",
          fx_source: r?.fx_source === "dolar_observado" ? "dolar_observado" : "manual",
          tx_hash: r?.tx_hash ?? "",
        }}
      />
    </div>
  );
}
