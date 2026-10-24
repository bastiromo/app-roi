import type { ZodError } from "zod";

/** Estado que devuelven las acciones de formulario. */
export interface FormState {
  message?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
}

export const emptyForm: FormState = {};

export function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

export function formValues(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

/** Traduce errores de PostgreSQL a mensajes entendibles. */
export function dbMessage(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Ya existe un registro con ese nombre o identificador.";
  if (error.code === "23514") return "Algún valor no cumple las reglas (revisa montos y porcentajes).";
  if (error.code === "23503") return "Un registro relacionado no existe o fue eliminado.";
  if (error.code === "42501") return "No tienes permiso para esta operación.";
  return `No se pudo guardar: ${error.message}`;
}
