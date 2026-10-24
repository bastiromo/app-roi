import type { Metadata } from "next";
import { LinkButton, PageHeader } from "@/components/ui";
import { addDual, d, toDual, ZERO } from "@/domain/money";
import { formatDate, formatMoney } from "@/lib/format";
import { expenseFormOptions, listExpenses } from "./data";
import { ExpensesList } from "./expenses-list";

export const metadata: Metadata = { title: "Gastos" };

const amountFmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string; categoria?: string; desde?: string; hasta?: string; guardado?: string }>;
}) {
  const sp = await searchParams;
  const [rows, { firms }] = await Promise.all([listExpenses(sp), expenseFormOptions()]);

  // Total con las mismas reglas del ROI: solo pagados; reembolsos restan.
  let total = ZERO;
  let counted = 0;
  for (const r of rows) {
    if (r.status !== "paid") continue;
    const dual = toDual({ amount: r.amount, currency: r.currency, fxUsdClp: r.fx_usd_clp, usdRate: r.usd_rate ?? undefined });
    total = r.kind === "cost" ? addDual(total, dual) : { usd: total.usd.sub(dual.usd), clp: total.clp.sub(dual.clp) };
    counted++;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gastos"
        description="Todo lo que pagas: evaluaciones, activaciones, resets, plataformas y comisiones. Los reembolsos se descuentan."
        action={<LinkButton href="/gastos/nuevo">Registrar gasto</LinkButton>}
      />
      <ExpensesList
        saved={Boolean(sp.guardado)}
        filter={sp}
        firms={firms}
        totals={{ usd: formatMoney(total.usd, "usd"), clp: formatMoney(total.clp, "clp"), count: counted }}
        rows={rows.map((r) => {
          const dual = toDual({ amount: r.amount, currency: r.currency, fxUsdClp: r.fx_usd_clp, usdRate: r.usd_rate ?? undefined });
          return {
            id: r.id,
            date: formatDate(r.occurred_on),
            kind: r.kind,
            status: r.status,
            firm: r.firms?.name ?? "General",
            account: r.accounts?.label ?? null,
            category: r.category,
            description: r.description,
            original: `${amountFmt.format(Number(d(r.amount).toFixed(2)))} ${r.currency}`,
            usd: `${r.kind === "refund" ? "+" : "−"}${formatMoney(dual.usd, "usd")}`,
            ref: r.external_ref,
          };
        })}
      />
    </div>
  );
}
