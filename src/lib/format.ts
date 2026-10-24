import type { Decimal } from "@/domain/money";

const usd = new Intl.NumberFormat("es-CL", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Intl recibe number solo al final, ya redondeado con Decimal (sin errores de coma flotante).
export function formatMoney(value: Decimal, currency: "usd" | "clp"): string {
  return currency === "usd" ? usd.format(Number(value.toFixed(2))) : clp.format(Number(value.toFixed(0)));
}

export function formatPct(value: Decimal | null): string {
  return value === null ? "—" : `${pct.format(Number(value.toFixed(1)))} %`;
}
