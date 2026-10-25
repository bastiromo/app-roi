import { d, type Decimal } from "@/domain/money";

const usd = new Intl.NumberFormat("es-CL", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = new Intl.NumberFormat("es-CL", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// Intl recibe number solo al final, ya redondeado con Decimal (sin errores de coma flotante).
export function formatMoney(value: Decimal, currency: "usd" | "clp"): string {
  // El signo va adelante ("−US$144,00"), no entre el símbolo y la cifra ("US$-144,00")
  const v = currency === "usd" ? Number(value.toFixed(2)) : Number(value.toFixed(0));
  const text = currency === "usd" ? usd.format(Math.abs(v)) : clp.format(Math.abs(v));
  return v < 0 ? `−${text}` : text;
}

export function formatPct(value: Decimal | null): string {
  return value === null ? "—" : `${pct.format(Number(value.toFixed(1)))} %`;
}

/** "90" → "90 %", "93.333333" → "93,33 %" */
export function formatRate(value: string | null): string {
  return value === null ? "—" : `${plain.format(Number(d(value).toFixed(2)))} %`;
}

/** Monto USD guardado como texto. Sin decimales si es entero. */
export function formatUsdText(value: string | null): string {
  if (value === null) return "—";
  const v = d(value);
  return v.isInteger() ? usd0.format(v.toNumber()) : usd.format(Number(v.toFixed(2)));
}

export function formatDate(iso: string | null): string {
  return iso ? dateFmt.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : "—";
}

/** Valor para un input editable: "25000.0000" → "25000". */
export function inputNumber(value: string | null): string {
  return value === null ? "" : d(value).toString();
}
