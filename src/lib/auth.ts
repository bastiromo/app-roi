import "server-only";
import { redirect } from "next/navigation";
import { isEmailAllowed } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  email: string;
}

/**
 * Capa de acceso a datos: toda página y acción con datos llama a esto.
 * No confía solo en el proxy: vuelve a verificar sesión, correo y 2FA.
 */
export async function requireUser(): Promise<{ user: CurrentUser; supabase: Awaited<ReturnType<typeof createClient>> }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  const email = String(claims.email ?? "");
  if (!isEmailAllowed(email)) redirect("/login?error=no-autorizado");
  if (claims.aal !== "aal2") redirect("/login/2fa");
  return { user: { id: claims.sub, email }, supabase };
}
