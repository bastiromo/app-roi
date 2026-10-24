import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { payoutFormOptions } from "../data";
import { PayoutForm } from "../payout-form";

export const metadata: Metadata = { title: "Registrar payout" };

export default async function NewPayoutPage({ searchParams }: { searchParams: Promise<{ cuenta?: string }> }) {
  const [sp, options] = await Promise.all([searchParams, payoutFormOptions()]);
  const account = options.accounts.find((a) => a.id === sp.cuenta);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-8">
      <PageHeader title="Registrar payout" description="Anota el retiro tal como aparece en la empresa. La app calcula tu parte y lo que llega." />
      <PayoutForm
        id={null}
        options={options}
        defaults={{
          firm_id: account?.firm_id ?? "",
          account_id: account?.id ?? "",
          status: "paid",
          requested_on: today,
          paid_on: today,
          requested_amount: "",
          trader_share_pct: "",
          transfer_fee: "",
          notes: "",
          receipt_mode: "estimated",
          received_amount: "",
          received_currency: "USDT",
          received_on: "",
          usd_rate: "",
          fx_usd_clp: "",
          fx_source: "manual",
          tx_hash: "",
        }}
      />
    </div>
  );
}
