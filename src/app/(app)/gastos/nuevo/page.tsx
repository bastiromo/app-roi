import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { inputNumber } from "@/lib/format";
import { expenseFormOptions, getExpense } from "../data";
import { ExpenseForm } from "../expense-form";

export const metadata: Metadata = { title: "Registrar gasto" };

export default async function NewExpensePage({ searchParams }: { searchParams: Promise<{ empresa?: string; cuenta?: string; copiar?: string }> }) {
  const [sp, options] = await Promise.all([searchParams, expenseFormOptions()]);
  const account = options.accounts.find((a) => a.id === sp.cuenta);
  const src = sp.copiar ? await getExpense(sp.copiar) : null;
  return (
    <div className="space-y-8">
      <PageHeader
        title={src ? "Duplicar gasto" : "Registrar gasto"}
        description={src ? "Copia del gasto elegido, con la fecha de hoy. Revisa y guarda." : "Registra el monto que realmente pagaste, en la moneda en que lo pagaste."}
      />
      <ExpenseForm
        id={null}
        options={options}
        defaults={{
          kind: "cost",
          refund_of_id: "",
          status: "paid",
          occurred_on: new Date().toISOString().slice(0, 10),
          firm_id: src?.firm_id ?? account?.firm_id ?? sp.empresa ?? "",
          account_id: account?.id ?? "",
          category: src?.category ?? "evaluacion",
          description: src?.description ?? "",
          amount: src ? inputNumber(src.amount) : "",
          currency: src?.currency ?? "USD",
          usd_rate: src ? inputNumber(src.usd_rate) : "",
          fx_usd_clp: "",
          fx_source: "manual",
          external_ref: "",
          tx_hash: "",
        }}
      />
    </div>
  );
}
