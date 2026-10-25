import type { Metadata } from "next";
import type { FlowRow } from "@/domain/flows";
import { type Period, PERIODS } from "@/domain/periods";
import { requireUser } from "@/lib/auth";
import { Q } from "@/lib/queries";
import { DashboardView } from "./dashboard-view";
import { listPayouts } from "./payouts/data";

export const metadata: Metadata = { title: "Resumen" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { supabase } = await requireUser();
  const sp = await searchParams;
  const period: Period = (PERIODS as readonly string[]).includes(sp.periodo ?? "") ? (sp.periodo as Period) : "todo";

  const [{ data: flows, error }, { count: activeAccounts }, { data: firms }, payouts, { data: nowIso }] = await Promise.all([
    supabase.from("cash_flows").select(Q.flowsSummary).returns<(FlowRow & { flow_date: string })[]>(),
    supabase.from("accounts").select("id", { count: "exact", head: true }).eq("status", "activa").is("deleted_at", null),
    supabase.from("firms").select("id,name").returns<{ id: string; name: string }[]>(),
    listPayouts(),
    supabase.rpc("db_now"),
  ]);

  if (error) {
    return <p role="alert" className="text-debit">No se pudieron cargar los movimientos: {error.message}</p>;
  }

  return (
    <DashboardView
      rows={flows ?? []}
      firms={firms ?? []}
      payouts={payouts}
      activeAccounts={activeAccounts ?? 0}
      nowIso={String(nowIso ?? "")}
      period={period}
    />
  );
}

