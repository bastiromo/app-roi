// Variables públicas (van al navegador): URL del proyecto y clave publicable de Supabase.
// La clave publicable no es secreta; la seguridad la dan RLS y el login.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

/** Correos autorizados a usar la app (solo servidor). Vacío = cualquiera con cuenta en Supabase. */
export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email: string | undefined | null): boolean {
  const list = allowedEmails();
  return list.length === 0 || (!!email && list.includes(email.toLowerCase()));
}
