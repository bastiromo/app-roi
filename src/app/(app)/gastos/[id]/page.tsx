import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { inputNumber } from "@/lib/format";
import { expenseFormOptions, getExpense } from "../data";
import { ExpenseForm } from "../expense-form";

export const metadata: Metadata = { title: "Editar gasto" };

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [x, options] = await Promise.all([getExpense(id), expenseFormOptions()]);
  if (!x) notFound();
  return (
    <div className="space-y-8">
      <PageHeader title={x.kind === "refund" ? "Editar reembolso" : "Editar gasto"} description="Cada cambio queda registrado en el historial de auditoría." />
      <ExpenseForm
        id={x.id}
        options={{ ...options, costs: options.costs.filter((c) => c.id !== x.id) }}
        defaults={{
          kind: x.kind,
          refund_of_id: x.refund_of_id ?? "",
          status: x.status,
          occurred_on: x.occurred_on,
          firm_id: x.firm_id ?? "",
          account_id: x.account_id ?? "",
          category: x.category,
          description: x.description ?? "",
          amount: inputNumber(x.amount),
          currency: x.currency,
          usd_rate: inputNumber(x.usd_rate),
          fx_usd_clp: inputNumber(x.fx_usd_clp),
          fx_source: x.fx_source === "dolar_observado" ? "dolar_observado" : "manual",
          external_ref: x.external_ref ?? "",
          tx_hash: x.tx_hash ?? "",
        }}
      />
    </div>
  );
}
