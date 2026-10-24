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
    is_configured: true,
  }));

export const PHASES = ["evaluacion", "financiada", "live"] as const;
export const STATUSES = ["activa", "aprobada", "suspendida", "perdida", "cerrada"] as const;

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
  })
  .superRefine((x, ctx) => {
    if (x.kind === "refund" && !x.refund_of_id) {
      ctx.addIssue({ code: "custom", path: ["refund_of_id"], message: "Elige el gasto que te reembolsaron." });
    }
    if (x.account_id && !x.firm_id) {
      ctx.addIssue({ code: "custom", path: ["account_id"], message: "Para vincular una cuenta, elige primero la empresa." });
    }
  })
  .transform(({ confirm_duplicate, ...x }) => ({
    data: {
      ...x,
      refund_of_id: x.kind === "refund" ? x.refund_of_id : null,
      usd_rate: x.currency === "USDT" || x.currency === "USDC" ? (x.usd_rate ?? "1") : null,
    },
    confirmDuplicate: confirm_duplicate,
  }));
