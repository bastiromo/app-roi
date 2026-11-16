import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { Simulator } from "./simulator";

export const metadata: Metadata = { title: "Simulador" };

export default function SimulatorPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Simulador" description="Apex 50K: cuánto inviertes en packs y activaciones, y cuánto ganas según cuántas cuentas lleguen a cobrar." />
      <Simulator />
    </div>
  );
}
