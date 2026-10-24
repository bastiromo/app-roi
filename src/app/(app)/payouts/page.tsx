import type { Metadata } from "next";
import { LinkButton, PageHeader } from "@/components/ui";
import { d } from "@/domain/money";
import { formatDate, formatMoney, formatRate } from "@/lib/format";
import { listPayouts, payoutFormOptions } from "./data";
import { PayoutsList } from "./payouts-list";

export const metadata: Metadata = { title: "Payouts" };

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<{ empresa?: string; estado?: string; guardado?: string }> }) {
  const sp = await searchParams;
  const [rows, { firms }] = await Promise.all([listPayouts(sp), payoutFormOptions()]);

  const totals = rows.reduce(
    (t, r) => {
      const live = r.status !== "rejected" && r.status !== "cancelled";
      const share = d(r.requested_amount).mul(d(r.trader_share_pct)).div(100);
      const waiting = !r.received && (r.status === "requested" || r.status === "approved" || r.status === "paid");
      return {
        gross: live ? t.gross.add(d(r.requested_amount)) : t.gross,
        received: r.received ? t.received.add(d(r.received.usd)) : t.received,
        estimated: r.received?.estimated ? t.estimated.add(d(r.received.usd)) : t.estimated,
        pending: waiting ? t.pending.add(share) : t.pending,
      };
    },
    { gross: d(0), received: d(0), estimated: d(0), pending: d(0) },
  );
  const gross = totals.gross;
  const received = totals.received;
  const estimated = totals.estimated;
  const pendingTotal = totals.pending;
  const list = rows.map((r) => {
    const share = d(r.requested_amount).mul(d(r.trader_share_pct)).div(100);
    const waiting = !r.received && (r.status === "requested" || r.status === "approved" || r.status === "paid");
    return {
      id: r.id,
      date: formatDate(r.paid_on ?? r.requested_on),
      firm: r.firms?.name ?? "",
      account: r.accounts?.label ?? "",
      status: r.status,
      gross: formatMoney(d(r.requested_amount), "usd"),
      pct: formatRate(r.trader_share_pct),
      received: r.received ? formatMoney(d(r.received.usd), "usd") : null,
      receivedEstimated: r.received?.estimated ?? false,
      pending: waiting ? formatMoney(share, "usd") : null,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payouts"
        description="Cada retiro que pides a una empresa. Solo cuenta para el ROI cuando está pagado y registras lo que llegó."
        action={<LinkButton href="/payouts/nuevo">Registrar payout</LinkButton>}
      />
      <PayoutsList
        saved={Boolean(sp.guardado)}
        filter={sp}
        firms={firms.map((f) => ({ id: f.id, name: f.name }))}
        rows={list}
        totals={{
          gross: formatMoney(gross, "usd"),
          received: formatMoney(received, "usd"),
          estimated: estimated.isZero() ? null : formatMoney(estimated, "usd"),
          pending: pendingTotal.isZero() ? null : formatMoney(pendingTotal, "usd"),
        }}
      />
    </div>
  );
}
