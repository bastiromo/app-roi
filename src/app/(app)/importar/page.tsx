import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { Importer } from "./importer";

export const metadata: Metadata = { title: "Importar" };

export default function ImportPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Importar historial"
        description="Carga gastos o payouts desde un archivo CSV. Verás una vista previa antes de guardar, y nada se duplica."
      />
      <Importer />
      <section className="max-w-prose space-y-3 text-sm text-ink-2">
        <h2 className="font-semibold text-ink">¿Cómo obtengo el archivo?</h2>
        <p>
          Toma screenshots del historial de órdenes o de payouts de la empresa y mándaselos a Claude: te devolverá el CSV listo,
          con los totales verificados contra la pantalla.
        </p>
        <p>
          <strong className="text-ink">Gastos:</strong> columnas firm, external_ref, occurred_on, category, description, amount,
          currency, status.
          <br />
          <strong className="text-ink">Payouts:</strong> columnas firm, account_external_id, requested_on, approved_amount, currency,
          status y, si los sabes, amount_received y received_on. Sin monto recibido, se usa el estimado de la empresa.
        </p>
      </section>
    </div>
  );
}
