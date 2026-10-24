import type { Amount, Currency } from "./money";

export type ExpenseCategory =
  | "evaluacion"
  | "activacion"
  | "reset"
  | "suscripcion"
  | "plataforma"
  | "datos_mercado"
  | "comision_bancaria"
  | "comision_red"
  | "otros";

/** Solo los gastos "paid" afectan los cálculos (perspectiva de caja). */
export type ExpenseStatus = "pending" | "paid" | "failed" | "void";

export interface Expense extends Amount {
  id: string;
  kind: "cost" | "refund";
  refundOfId?: string;
  status: ExpenseStatus;
  occurredOn: string; // AAAA-MM-DD
  firmId?: string; // vacío = costo general (no asignado a empresa)
  accountId?: string;
  category: ExpenseCategory;
  externalRef?: string; // n.º de orden o hash de transacción
}

export type PayoutStatus = "draft" | "requested" | "approved" | "paid" | "rejected" | "cancelled";

/** Proceso de retiro con la empresa. NO es dinero recibido. */
export interface Payout {
  id: string;
  firmId: string;
  accountId: string;
  status: PayoutStatus;
  requestedOn: string;
  requestedAmount: string; // lo que muestra la empresa (retiro bruto)
  traderSharePct: string; // ej. "90" en Lucid
  firmFeeAmount?: string; // comisión que la empresa descuenta (si informa)
  currency: Currency;
}

export interface ReceiptAllocation {
  payoutId: string;
  /** Si se omite, el recibo se reparte en proporción al neto estimado de cada payout. */
  amount?: string;
}

/**
 * Dinero que llegó (a la billetera o al banco). Única fuente de R.
 * basis "estimated": monto calculado con la regla de la empresa (% del trader − comisión fija)
 * cuando no hay registro real. Cuenta en R, pero el resumen lo informa por separado.
 */
export interface Receipt extends Amount {
  id: string;
  receivedOn: string;
  basis?: "actual" | "estimated"; // por defecto "actual"
  txHash?: string;
  allocations: ReceiptAllocation[];
}

export interface TaxPayment extends Amount {
  id: string;
  paidOn: string;
  taxYear: number;
}

/** Configuración de la empresa: solo prellena y estima; lo aplicado se guarda en cada payout. */
export interface Firm {
  id: string;
  name: string;
  defaultTraderSharePct: string; // Lucid: "90"
  defaultTransferFee: string; // comisión fija por payout al transferir. Lucid: "25"
  transferFeeCurrency: Currency;
}

export interface Ledger {
  expenses: Expense[];
  payouts: Payout[];
  receipts: Receipt[];
  taxes: TaxPayment[];
}

export interface Scope {
  firmId?: string;
  /** Cuentas incluidas (el llamador agrega la cadena evaluación → financiada). */
  accountIds?: string[];
  from?: string; // inclusive
  to?: string; // inclusive
}
