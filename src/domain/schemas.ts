import { d } from "./money";
import { z } from "zod";

/** Campos vacíos de formulario → null. */
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

/** Número decimal escrito en formato chileno o inglés ("1.234,56", "1234.56", "25"). Devuelve texto exacto. */
export function parseDecimalInput(raw: string): string | null {
  const s = raw.trim().replace(/\s|US\$|\$|%/g, "");
  if (s === "") return null;
  let normalized = s;
  if (s.includes(",") && s.includes(".")) {
    // El último separador es el decimal
    normalized = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    normalized = s.replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1 || /^[1-9]\d{0,2}\.\d{3}$/.test(s)) {
    normalized = s.replace(/\./g, ""); // "25.000" = veinticinco mil
  }
  return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : "NaN";
}

const decimal = (label: string, opts: { min?: number; max?: number; required?: boolean } = {}) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      const parsed = parseDecimalInput(v ?? "");
      if (parsed === null) {
        if (opts.required) ctx.addIssue({ code: "custom", message: `${label} es obligatorio.` });
        return null;
      }
      if (parsed === "NaN") {
        ctx.addIssue({ code: "custom", message: `${label}: escribe solo un número.` });
        return null;
      }
      const n = Number(parsed);
      if (opts.min !== undefined && n < opts.min) ctx.addIssue({ code: "custom", message: `${label} debe ser al menos ${opts.min}.` });
      if (opts.max !== undefined && n > opts.max) ctx.addIssue({ code: "custom", message: `${label} no puede superar ${opts.max}.` });
      return parsed;
    });

const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true");

export const firmSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es obligatorio.").max(80),
    website: optionalText,
    default_trader_share_pct: decimal("Tu porcentaje", { min: 0, max: 100, required: true }),
    has_tier: checkbox,
    split_tier_pct_before: decimal("Porcentaje del tramo", { min: 0, max: 100 }),
    split_tier_threshold: decimal("Umbral", { min: 0.01 }),
    default_transfer_fee: decimal("Comisión de retiro", { min: 0, required: true }),
    transfer_fee_is_estimate: checkbox,
    payout_rules_notes: optionalText,
    notes: optionalText,
    is_active: checkbox,
    max_payouts_per_account: decimal("Retiros máximos", { min: 1, max: 50 }).refine(
      (v) => v === null || /^\d+$/.test(v),
      "Escribe un número entero (ej. 4).",
    ),
  })
  .superRefine((f, ctx) => {
    if (f.has_tier && (!f.split_tier_pct_before || !f.split_tier_threshold)) {
      ctx.addIssue({ code: "custom", path: ["split_tier_threshold"], message: "Completa el umbral y el porcentaje del tramo, o desactiva la regla." });
    }
  })
  .transform(({ has_tier, ...f }) => ({
    ...f,
    split_tier_pct_before: has_tier ? f.split_tier_pct_before : null,
    split_tier_threshold: has_tier ? f.split_tier_threshold : null,
    max_payouts_per_account: f.max_payouts_per_account === null ? null : Number(f.max_payouts_per_account),
    is_configured: true,
  }));

export const PHASES = ["evaluacion", "financiada", "live"] as const;
export const STATUSES = ["activa", "aprobada", "suspendida", "perdida", "cerrada"] as const;

/** Estados que se pueden asignar a varias cuentas a la vez ("Aprobada" se hace con Aprobar, que crea la financiada). */
export const BULK_STATUSES = ["activa", "suspendida", "perdida", "cerrada"] as const;
export type BulkStatus = (typeof BULK_STATUSES)[number];

export const PHASE_LABEL: Record<(typeof PHASES)[number], string> = {
  evaluacion: "Evaluación",
  financiada: "Financiada",
  live: "Live",
};
export const STATUS_LABEL: Record<(typeof STATUSES)[number], string> = {
  activa: "Activa",
  aprobada: "Aprobada",
  suspendida: "Suspendida",
  perdida: "Perdida",
  cerrada: "Cerrada",
};

const isoDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Fecha inválida.")
  .nullable()
  .optional();

export const accountSchema = z
  .object({
    firm_id: z.uuid("Elige una empresa."),
    label: z.string().trim().min(1, "Ponle un nombre a la cuenta.").max(80),
    external_id: optionalText,
    plan_name: optionalText,
    nominal_size: decimal("Tamaño nominal", { min: 0 }),
    phase: z.enum(PHASES, "Elige la fase."),
    status: z.enum(STATUSES, "Elige el estado."),
    origin_account_id: z
      .string()
      .optional()
      .transform((v) => (v ? v : null))
      .pipe(z.uuid().nullable()),
    opened_on: isoDate,
    closed_on: isoDate,
    notes: optionalText,
  })
  .superRefine((a, ctx) => {
    if (a.opened_on && a.closed_on && a.closed_on < a.opened_on) {
      ctx.addIssue({ code: "custom", path: ["closed_on"], message: "El cierre no puede ser anterior a la apertura." });
    }
    if ((a.status === "cerrada" || a.status === "perdida") && !a.closed_on) {
      ctx.addIssue({ code: "custom", path: ["closed_on"], message: "Indica la fecha de cierre o pérdida." });
    }
  });

export const approvalSchema = z.object({
  label: z.string().trim().min(1, "Escribe el nombre de la cuenta financiada (ej. PRO001).").max(80),
  external_id: optionalText,
  approved_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Indica la fecha de aprobación."),
});

// ---------------------------------------------------------------------------
// Gastos
// ---------------------------------------------------------------------------
export const CATEGORIES = [
  "evaluacion",
  "activacion",
  "reset",
  "suscripcion",
  "plataforma",
  "datos_mercado",
  "comision_bancaria",
  "comision_red",
  "otros",
] as const;

export const CATEGORY_LABEL: Record<(typeof CATEGORIES)[number], string> = {
  evaluacion: "Evaluación",
  activacion: "Activación",
  reset: "Reset",
  suscripcion: "Suscripción",
  plataforma: "Plataforma",
  datos_mercado: "Datos de mercado",
  comision_bancaria: "Comisión bancaria",
  comision_red: "Comisión de red (cripto)",
  otros: "Otros",
};

export const CURRENCIES = ["USD", "USDT", "USDC", "CLP"] as const;
export const EXPENSE_STATUSES = ["paid", "pending", "failed", "void"] as const;
export const EXPENSE_STATUS_LABEL: Record<(typeof EXPENSE_STATUSES)[number], string> = {
  paid: "Pagado",
  pending: "Pendiente",
  failed: "Fallido",
  void: "Anulado",
};

const optionalUuid = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.uuid().nullable());

export const expenseSchema = z
  .object({
    kind: z.enum(["cost", "refund"]),
    refund_of_id: optionalUuid,
    status: z.enum(EXPENSE_STATUSES),
    occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Indica la fecha."),
    firm_id: optionalUuid,
    account_id: optionalUuid,
    category: z.enum(CATEGORIES, "Elige una categoría."),
    description: optionalText,
    amount: decimal("Monto", { min: 0.0001, required: true }),
    currency: z.enum(CURRENCIES),
    usd_rate: decimal("Valor en USD de 1 unidad", { min: 0.0001 }),
    fx_usd_clp: decimal("Dólar en pesos", { min: 1, required: true }),
    fx_source: z.enum(["manual", "dolar_observado"]).default("manual"),
    external_ref: optionalText,
    tx_hash: optionalText,
    confirm_duplicate: checkbox,
    // Varias compras iguales (solo al crear)
    quantity: z
      .string()
      .optional()
      .transform((v) => (v && v.trim() !== "" ? Number(v) : 1))
      .pipe(z.number().int("La cantidad debe ser un número entero.").min(1, "Mínimo 1.").max(50, "Máximo 50 de una vez.")),
    create_accounts: checkbox,
    account_prefix: optionalText,
    account_start: z
      .string()
      .optional()
      .transform((v) => (v && v.trim() !== "" ? Number(v) : 1))
      .pipe(z.number().int("Debe ser un número entero.").min(0)),
  })
  .superRefine((x, ctx) => {
    const refs = splitRefs(x.external_ref);
    if (x.quantity > 1) {
      if (x.kind === "refund") ctx.addIssue({ code: "custom", path: ["quantity"], message: "Los reembolsos se registran de a uno." });
      if (refs.length > 0 && refs.length !== x.quantity) {
        ctx.addIssue({ code: "custom", path: ["external_ref"], message: `Escribe ${x.quantity} números de orden (uno por compra) o déjalo vacío. Escribiste ${refs.length}.` });
      }
      if (x.tx_hash) ctx.addIssue({ code: "custom", path: ["tx_hash"], message: "El hash identifica una sola transacción: déjalo vacío al registrar varias." });
    } else if (refs.length > 1) {
      ctx.addIssue({ code: "custom", path: ["external_ref"], message: "Un solo número de orden por gasto." });
    }
    if (x.create_accounts && x.quantity >= 1) {
      if (!x.firm_id) ctx.addIssue({ code: "custom", path: ["firm_id"], message: "Para crear las cuentas, elige la empresa." });
      if (!x.account_prefix) ctx.addIssue({ code: "custom", path: ["account_prefix"], message: "Escribe cómo se llamarán las cuentas." });
    }
    if (x.kind === "refund" && !x.refund_of_id) {
      ctx.addIssue({ code: "custom", path: ["refund_of_id"], message: "Elige el gasto que te reembolsaron." });
    }
    if (x.account_id && !x.firm_id) {
      ctx.addIssue({ code: "custom", path: ["account_id"], message: "Para vincular una cuenta, elige primero la empresa." });
    }
  })
  .transform(({ confirm_duplicate, quantity, create_accounts, account_prefix, account_start, ...x }) => ({
    data: {
      ...x,
      refund_of_id: x.kind === "refund" ? x.refund_of_id : null,
      usd_rate: x.currency === "USDT" || x.currency === "USDC" ? (x.usd_rate ?? "1") : null,
    },
    confirmDuplicate: confirm_duplicate,
    batch: {
      quantity,
      refs: splitRefs(x.external_ref),
      accounts: create_accounts && !x.account_id ? { prefix: account_prefix ?? "", start: account_start } : null,
    },
  }));

/** "123, 456 789" → ["123","456","789"] */
export function splitRefs(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[\s,;]+/)
    .map((r) => r.replace(/^#/, "").trim())
    .filter(Boolean);
}

/** Nombres de cuentas para una compra múltiple: "Tradeify 50K" desde 1 → "Tradeify 50K 1", "Tradeify 50K 2"… */
export function batchAccountLabels(prefix: string, start: number, quantity: number): string[] {
  return Array.from({ length: quantity }, (_, i) => `${prefix.trim()} ${start + i}`);
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------
export const PAYOUT_STATUSES = ["requested", "approved", "paid", "rejected", "cancelled"] as const;
export const PAYOUT_STATUS_LABEL: Record<(typeof PAYOUT_STATUSES)[number] | "draft", string> = {
  draft: "Borrador",
  requested: "Solicitado",
  approved: "Aprobado",
  paid: "Pagado",
  rejected: "Rechazado",
  cancelled: "Cancelado",
};

const isoRequired = (msg: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg);

export const payoutSchema = z
  .object({
    firm_id: z.uuid("Elige la empresa."),
    account_id: z.uuid("Elige la cuenta."),
    status: z.enum(PAYOUT_STATUSES),
    requested_on: isoRequired("Indica la fecha de solicitud."),
    paid_on: isoDate,
    requested_amount: decimal("Monto retirado", { min: 0.01, required: true }),
    trader_share_pct: decimal("Tu porcentaje", { min: 0, max: 100, required: true }),
    transfer_fee: decimal("Comisión de transferencia", { min: 0 }),
    notes: optionalText,
    receipt_mode: z.enum(["estimated", "actual"]).default("estimated"),
    received_amount: decimal("Monto recibido", { min: 0 }),
    received_currency: z.enum(CURRENCIES).default("USDT"),
    received_on: isoDate,
    usd_rate: decimal("Valor en USD de 1 unidad", { min: 0.0001 }),
    fx_usd_clp: decimal("Dólar en pesos", { min: 1 }),
    fx_source: z.enum(["manual", "dolar_observado"]).default("manual"),
    tx_hash: optionalText,
  })
  .superRefine((p, ctx) => {
    if (p.status === "paid") {
      if (!p.fx_usd_clp) ctx.addIssue({ code: "custom", path: ["fx_usd_clp"], message: "Indica el dólar en pesos de la fecha de pago." });
      if (p.receipt_mode === "actual" && !p.received_amount) {
        ctx.addIssue({ code: "custom", path: ["received_amount"], message: "Escribe cuánto llegó, o elige usar el estimado." });
      }
    }
    if (p.paid_on && p.paid_on < p.requested_on) {
      ctx.addIssue({ code: "custom", path: ["paid_on"], message: "El pago no puede ser anterior a la solicitud." });
    }
  });

/** Lo que llega estimado: retiro × % del trader − comisión de transferencia. Nunca negativo. */
export function estimateReceived(requested: string, pct: string, transferFee: string | null): string {
  const v = d(requested).mul(d(pct)).div(100).sub(d(transferFee ?? "0"));
  return (v.isNegative() ? d(0) : v).toDecimalPlaces(2).toFixed(2);
}

/** Venta de cripto por pesos (P2P o exchange). */
export const conversionSchema = z.object({
  converted_on: isoDate.refine((v) => v !== null, "La fecha es obligatoria."),
  from_currency: z.enum(["USDT", "USDC"]),
  from_amount: decimal("Cripto vendida", { required: true, min: 0.0001 }),
  to_amount: decimal("Pesos recibidos", { required: true, min: 1 }),
  fee_amount: decimal("Comisión", { min: 0 }),
  fee_currency: z.enum(["CLP", "CRYPTO"]),
  exchange_label: optionalText,
  tx_ref: optionalText,
  notes: optionalText,
});
