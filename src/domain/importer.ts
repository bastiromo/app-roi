/**
 * Importador de historial (CSV). Lógica pura: parsea, detecta el tipo de archivo y valida
 * cada fila. Las decisiones que requieren la base (duplicados, dólar, cuentas) se toman
 * en el servidor con este resultado.
 *
 * Formatos (encabezados exactos, en cualquier orden):
 *  Gastos:  firm, external_ref, occurred_on, category, description, amount, currency, status
 *  Payouts: firm, account_external_id, requested_on, approved_amount, currency, status,
 *           [amount_received], [received_on]
 */
import { CATEGORIES, parseDecimalInput } from "./schemas";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === "," || c === ";" || c === "\t") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((f) => f.trim()));
}

export type ImportKind = "expenses" | "payouts";

const STATUS_EXPENSE: Record<string, "paid" | "failed" | "pending" | "void"> = {
  pagado: "paid", paid: "paid", completed: "paid", completado: "paid",
  fallido: "failed", failed: "failed",
  pendiente: "pending", pending: "pending",
  anulado: "void", void: "void", cancelled: "void", cancelado: "void",
};
const STATUS_PAYOUT: Record<string, "paid" | "requested" | "approved" | "rejected" | "cancelled"> = {
  pagado: "paid", paid: "paid",
  solicitado: "requested", requested: "requested", pending: "requested", pendiente: "requested",
  aprobado: "approved", approved: "approved",
  rechazado: "rejected", rejected: "rejected", denied: "rejected",
  cancelado: "cancelled", cancelled: "cancelled",
};
const CURRENCIES = ["USD", "USDT", "USDC", "CLP"] as const;
type Cur = (typeof CURRENCIES)[number];

export interface ExpenseImportRow {
  line: number;
  firm: string;
  externalRef: string | null;
  occurredOn: string;
  category: (typeof CATEGORIES)[number];
  description: string | null;
  amount: string;
  currency: Cur;
  status: "paid" | "failed" | "pending" | "void";
}

export interface PayoutImportRow {
  line: number;
  firm: string;
  accountExternalId: string;
  accountLabel: string;
  requestedOn: string;
  amount: string;
  currency: Cur;
  status: "paid" | "requested" | "approved" | "rejected" | "cancelled";
  receivedAmount: string | null;
  receivedOn: string | null;
}

export interface RowError {
  line: number;
  message: string;
}

export type Parsed =
  | { kind: "expenses"; rows: ExpenseImportRow[]; errors: RowError[] }
  | { kind: "payouts"; rows: PayoutImportRow[]; errors: RowError[] }
  | { kind: null; rows: []; errors: RowError[] };

const EXPENSE_HEADERS = ["firm", "occurred_on", "amount", "currency"];
const PAYOUT_HEADERS = ["firm", "account_external_id", "requested_on", "approved_amount"];

/** Normaliza fechas: 2026-10-15, 15-10-2026, 15/10/2026, "Oct 15, 2026". */
export function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  m = s.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/);
  if (m) {
    const mi = months.indexOf(m[1].toLowerCase());
    if (mi >= 0) return `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

/** "LFF050-0BY89NW5-PRO008" → "PRO008" (lo último después del guion). */
export function labelFromExternalId(id: string): string {
  const parts = id.split("-").filter(Boolean);
  return parts[parts.length - 1] ?? id;
}

function money(raw: string | undefined): string | null | "NaN" {
  return parseDecimalInput((raw ?? "").replace(/^\$/, ""));
}

export function parseImport(text: string): Parsed {
  const table = parseCsv(text);
  if (table.length < 2) return { kind: null, rows: [], errors: [{ line: 1, message: "El archivo no tiene filas de datos." }] };
  const head = table[0].map((h) => h.toLowerCase());
  const col = (name: string) => head.indexOf(name);
  const get = (r: string[], name: string) => (col(name) >= 0 ? (r[col(name)] ?? "") : "");

  const isExpenses = EXPENSE_HEADERS.every((h) => head.includes(h));
  const isPayouts = PAYOUT_HEADERS.every((h) => head.includes(h));
  if (!isExpenses && !isPayouts) {
    return {
      kind: null,
      rows: [],
      errors: [{ line: 1, message: `No reconozco el formato. Para gastos se necesitan las columnas ${EXPENSE_HEADERS.join(", ")}; para payouts, ${PAYOUT_HEADERS.join(", ")}.` }],
    };
  }

  const errors: RowError[] = [];
  if (isPayouts) {
    const rows: PayoutImportRow[] = [];
    table.slice(1).forEach((r, i) => {
      const line = i + 2;
      const firm = get(r, "firm");
      const ext = get(r, "account_external_id");
      const date = normalizeDate(get(r, "requested_on"));
      const amount = money(get(r, "approved_amount"));
      const currency = (get(r, "currency") || "USD").toUpperCase() as Cur;
      const status = STATUS_PAYOUT[(get(r, "status") || "pagado").toLowerCase()];
      const recRaw = get(r, "amount_received");
      const received = recRaw ? money(recRaw) : null;
      const recOn = get(r, "received_on") ? normalizeDate(get(r, "received_on")) : null;
      const problems = [
        !firm && "falta la empresa",
        !ext && "falta el ID de la cuenta",
        !date && "fecha inválida",
        (!amount || amount === "NaN") && "monto inválido",
        !CURRENCIES.includes(currency) && `moneda ${currency} no soportada`,
        !status && `estado "${get(r, "status")}" no reconocido`,
        received === "NaN" && "monto recibido inválido",
        get(r, "received_on") && !recOn && "fecha de recepción inválida",
      ].filter(Boolean);
      if (problems.length) return errors.push({ line, message: problems.join("; ") });
      rows.push({
        line, firm, accountExternalId: ext, accountLabel: labelFromExternalId(ext), requestedOn: date!, amount: amount!,
        currency, status, receivedAmount: received as string | null, receivedOn: recOn,
      });
    });
    return { kind: "payouts", rows, errors };
  }

  const rows: ExpenseImportRow[] = [];
  const seenRefs = new Map<string, number>();
  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    const firm = get(r, "firm");
    const date = normalizeDate(get(r, "occurred_on"));
    const amount = money(get(r, "amount"));
    const currency = (get(r, "currency") || "USD").toUpperCase() as Cur;
    const category = (get(r, "category") || "evaluacion").toLowerCase() as ExpenseImportRow["category"];
    const status = STATUS_EXPENSE[(get(r, "status") || "pagado").toLowerCase()];
    const ref = get(r, "external_ref").replace(/^#/, "") || null;
    const refKey = ref ? `${firm.toLowerCase()}|${ref}` : null;
    const problems = [
      !firm && "falta la empresa",
      !date && "fecha inválida",
      (!amount || amount === "NaN") && "monto inválido",
      !CURRENCIES.includes(currency) && `moneda ${currency} no soportada`,
      !(CATEGORIES as readonly string[]).includes(category) && `categoría "${category}" no reconocida`,
      !status && `estado "${get(r, "status")}" no reconocido`,
      refKey && seenRefs.has(refKey) && `n.º de orden repetido en el archivo (línea ${seenRefs.get(refKey)})`,
    ].filter(Boolean);
    if (refKey && !seenRefs.has(refKey)) seenRefs.set(refKey, line);
    if (problems.length) return errors.push({ line, message: problems.join("; ") });
    rows.push({ line, firm, externalRef: ref, occurredOn: date!, category, description: get(r, "description") || null, amount: amount!, currency, status });
  });
  return { kind: "expenses", rows, errors };
}
