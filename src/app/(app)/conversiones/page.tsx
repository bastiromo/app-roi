import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { conversionResult, type ConversionRow, summarizeConversions } from "@/domain/conversions";
import { d, type Decimal } from "@/domain/money";
import { requireUser } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import { Q } from "@/lib/queries";
import { ConversionForm } from "./conversion-form";
import { ConversionsList } from "./conversions-list";

export const metadata: Metadata = { title: "Ventas de cripto" };

type Row = ConversionRow & {
  id: string;
  converted_on: string;
  from_currency: string;
  exchange_label: string | null;
  tx_ref: string | null;
};

const qty = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });
const price = (v: Decimal | null) => (v ? new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 2 }).format(Number(v.toFixed(2))) : "—");
const signed = (v: Decimal) => `${v.gt(0) ? "+" : ""}${formatMoney(v, "clp")}`;

export default async function ConversionsPage() {
  const { supabase } = await requireUser();
  const [{ data, error }, { data: nowIso }] = await Promise.all([
    supabase.from("fx_conversions").select(Q.conversions).is("deleted_at", null).order("converted_on", { ascending: false }).returns<Row[]>(),
    supabase.rpc("db_now"),
  ]);
  const rows = data ?? [];
  const s = summarizeConversions(rows);
  // Fecha de hoy en Chile (la decide la base, no el render)
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date(String(nowIso ?? "")));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Ventas de cripto"
        description="Cuando vendes tus USDT por pesos (P2P o exchange). Te muestra a qué precio vendes y cuánto ganas o pierdes frente al dólar observado de ese día. Es solo informativo: no cambia tu ROI."
      />
      {error && <p role="alert" className="text-debit">No se pudieron cargar las ventas: {error.message}</p>}

      {rows.length > 0 && (
        <dl className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Pesos recibidos" value={formatMoney(s.clpNet, "clp")} note={`${s.count} ${s.count === 1 ? "venta" : "ventas"}`} />
          <Stat label="Cripto vendida" value={`${qty.format(Number(s.cryptoOut.toFixed(2)))} USDT`} note="Incluye comisiones en cripto" />
          <Stat label="Precio promedio" value={price(s.avgPrice)} note={s.compared.avgRef ? `Dólar observado promedio ${price(s.compared.avgRef)}` : "por USDT"} />
          <Stat
            label="Frente al dólar observado"
            value={s.compared.count ? signed(s.compared.difference) : "—"}
            tone={s.compared.count ? (s.compared.difference.gte(0) ? "credit" : "debit") : undefined}
            note={
              s.compared.count === 0
                ? "Sin dólar observado para comparar"
                : s.compared.difference.gte(0)
                  ? "Vendiste por sobre el dólar observado"
                  : "Vendiste por debajo del dólar observado"
            }
          />
        </dl>
      )}

      <ConversionForm today={today} lastLabel={rows[0]?.exchange_label ?? "P2P"} />

      <ConversionsList
        rows={rows.map((r) => {
          const x = conversionResult(r);
          return {
            id: r.id,
            date: formatDate(r.converted_on),
            where: r.exchange_label ?? "",
            ref: r.tx_ref,
            sold: `${qty.format(Number(d(r.from_amount).toFixed(4)))} ${r.from_currency}`,
            pesos: formatMoney(x.clpNet, "clp"),
            price: price(x.price),
            diff: x.difference ? signed(x.difference) : null,
            diffPositive: x.difference ? x.difference.gte(0) : true,
          };
        })}
      />
    </div>
  );
}

function Stat(props: { label: string; value: string; note?: string; tone?: "credit" | "debit" }) {
  const color = props.tone === "credit" ? "text-credit" : props.tone === "debit" ? "text-debit" : "text-ink";
  return (
    <div className="bg-surface p-4">
      <dt className="text-sm text-ink-2">{props.label}</dt>
      <dd className={`num mt-1 text-xl font-semibold ${color}`}>{props.value}</dd>
      {props.note && <dd className="mt-1 text-xs text-ink-3">{props.note}</dd>}
    </div>
  );
}
