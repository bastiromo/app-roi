// Variables públicas (van al navegador): URL del proyecto y clave publicable de Supabase.
// La clave publicable no es secreta; la seguridad la dan RLS y el login.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

// El acceso se controla por invitación en la base de datos (ver migración 20261024000007).
