import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { inputNumber } from "@/lib/format";
import { getFirm, getFirmMaxPayouts } from "../data";
import { FirmForm } from "../firm-form";

export const metadata: Metadata = { title: "Editar empresa" };

export default async function EditFirmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [firm, maxPayouts] = await Promise.all([getFirm(id), getFirmMaxPayouts(id)]);
  if (!firm) notFound();

  return (
    <div className="space-y-8">
      <PageHeader title={firm.name} description={firm.is_configured ? "Editar reglas de la empresa." : "Configura esta empresa para empezar a usarla."} />
      <FirmForm
        id={firm.id}
        defaults={{
          name: firm.name,
          website: firm.website ?? "",
          default_trader_share_pct: firm.is_configured ? inputNumber(firm.default_trader_share_pct) : "",
          split_tier_threshold: inputNumber(firm.split_tier_threshold),
          split_tier_pct_before: inputNumber(firm.split_tier_pct_before),
          default_transfer_fee: firm.is_configured ? inputNumber(firm.default_transfer_fee) : "",
          transfer_fee_is_estimate: firm.transfer_fee_is_estimate,
          payout_rules_notes: firm.payout_rules_notes ?? "",
          max_payouts_per_account: maxPayouts === null ? "" : String(maxPayouts),
          notes: firm.notes ?? "",
          is_active: firm.is_configured ? firm.is_active : true,
          is_configured: firm.is_configured,
        }}
      />
    </div>
  );
}
