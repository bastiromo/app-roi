import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isTrustedDevice, TRUST_COOKIE } from "@/lib/trusted-device";

export interface CurrentUser {
  id: string;
  email: string;
}

/**
 * Capa de acceso a datos: toda página y acción con datos llama a esto.
 * No confía solo en el proxy: vuelve a verificar sesión y 2FA (o dispositivo recordado).
 */
export async function requireUser(): Promise<{ user: CurrentUser; supabase: Awaited<ReturnType<typeof createClient>> }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  const email = String(claims.email ?? "");
  if (claims.aal !== "aal2") {
    const token = (await cookies()).get(TRUST_COOKIE)?.value;
    if (!(await isTrustedDevice(supabase, token))) redirect("/login/2fa");
  }
  return { user: { id: claims.sub, email }, supabase };
}
