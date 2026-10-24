import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getAccount } from "../../data";
import { ApproveForm } from "./approve-form";

export const metadata: Metadata = { title: "Aprobar evaluación" };

export default async function ApprovePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getAccount(id);
  if (!found) notFound();
  const { account: a } = found;
  if (a.phase !== "evaluacion" || a.status !== "activa") redirect(`/cuentas/${id}`);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Aprobé ${a.label}`}
        description={`${a.label} quedará como aprobada y se creará la cuenta financiada en ${a.firms?.name ?? "la misma empresa"}, vinculada a ella. Lo que pagaste por la evaluación se contará en el ROI de la nueva cuenta.`}
      />
      <ApproveForm evaluationId={a.id} minDate={a.opened_on} />
    </div>
  );
}
