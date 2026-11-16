import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { ConsistencyCalculator } from "./calculator";

export const metadata: Metadata = { title: "Consistencia" };

export default function ConsistencyPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Consistencia" description="Cuánto debes generar en el ciclo, en cuántos días y cuál es el tope por día para cumplir la regla de consistencia." />
      <ConsistencyCalculator />
    </div>
  );
}
