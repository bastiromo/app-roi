import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { AccountForm } from "../account-form";
import { accountFormOptions } from "../data";

export const metadata: Metadata = { title: "Nueva cuenta" };

export default async function NewAccountPage({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const [{ empresa }, options] = await Promise.all([searchParams, accountFormOptions()]);
  return (
    <div className="space-y-8">
      <PageHeader title="Nueva cuenta" description="El costo de compra se registra después como gasto vinculado a esta cuenta." />
      <AccountForm
        id={null}
        options={options}
        defaults={{
          firm_id: empresa ?? "",
          label: "",
          external_id: "",
          plan_name: "",
          nominal_size: "",
          phase: "evaluacion",
          status: "activa",
          origin_account_id: "",
          opened_on: new Date().toISOString().slice(0, 10),
          closed_on: "",
          notes: "",
        }}
      />
    </div>
  );
}
