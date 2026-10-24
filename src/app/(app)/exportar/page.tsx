import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Exportar" };

function Option({ href, title, children, primary = false }: { href: string; title: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
      <div className="max-w-prose">
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-ink-2">{children}</p>
      </div>
      {/* Enlace normal (no prefetch): cada clic genera el archivo con los datos del momento */}
      <a
        href={href}
        download
        className={`inline-flex h-10 shrink-0 items-center justify-center rounded-lg px-4 text-sm font-semibold ${primary ? "bg-ink text-bg hover:opacity-90" : "border border-line hover:border-ink-3"}`}
      >
        Descargar
      </a>
    </li>
  );
}

export default function ExportPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Exportar" description="Descarga tus datos cuando quieras: para revisarlos en Excel, mandárselos a tu contador o guardar un respaldo propio." />
      <ul className="max-w-3xl space-y-3">
        <Option href="/exportar/excel" title="Todo en Excel (.xlsx)" primary>
          Hojas de Resumen (por empresa y mes a mes), Gastos, Payouts, Cuentas y Empresas, con montos en USD y CLP listos para
          filtrar y sumar.
        </Option>
        <Option href="/exportar/gastos" title="Gastos para respaldo (.csv)">
          En el mismo formato del importador: podrías volver a cargarlos en otra cuenta. Los reembolsos no se incluyen (están en el
          Excel).
        </Option>
        <Option href="/exportar/payouts" title="Payouts para respaldo (.csv)">
          En el formato del importador. Si el monto recibido era estimado, al reimportar se vuelve a estimar con la regla de la
          empresa.
        </Option>
      </ul>
    </div>
  );
}
