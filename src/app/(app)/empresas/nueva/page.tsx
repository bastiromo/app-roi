import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { FirmForm } from "../firm-form";

export const metadata: Metadata = { title: "Nueva empresa" };

export default function NewFirmPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Nueva empresa" description="Agrega una empresa de fondeo con sus reglas de reparto." />
      <FirmForm
        id={null}
        defaults={{
          name: "",
          website: "",
          default_trader_share_pct: "",
          split_tier_threshold: "",
          split_tier_pct_before: "",
          default_transfer_fee: "",
          transfer_fee_is_estimate: true,
          max_payouts_per_account: "4",
          payout_rules_notes: "",
          notes: "",
          is_active: true,
          is_configured: true,
        }}
      />
    </div>
  );
}
