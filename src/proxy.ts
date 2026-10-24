import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { isConfigured, isEmailAllowed, SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

/**
 * Se ejecuta antes de cada página:
 *  1. Refresca la sesión de Supabase (cookies).
 *  2. Sin sesión → /login.
 *  3. Correo no autorizado → cierra sesión.
 *  4. Sin 2FA configurado → /seguridad/2fa (obligatorio).
 *  5. 2FA configurado pero no verificado en esta sesión → /login/2fa.
 */
const PUBLIC_PATHS = ["/login", "/configuracion-pendiente"];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (!isConfigured) {
    return path === "/configuracion-pendiente"
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/configuracion-pendiente", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet, headers) {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const redirect = (to: string) => {
    const r = NextResponse.redirect(new URL(to, request.url));
    for (const c of response.cookies.getAll()) r.cookies.set(c);
    return r;
  };

  if (!claims) {
    return PUBLIC_PATHS.some((p) => path === p) ? response : redirect("/login");
  }

  if (!isEmailAllowed(claims.email as string | undefined)) {
    await supabase.auth.signOut();
    return redirect("/login?error=no-autorizado");
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const hasFactor = aal?.nextLevel === "aal2";
  const verified = aal?.currentLevel === "aal2";

  if (!hasFactor && path !== "/seguridad/2fa") return redirect("/seguridad/2fa");
  if (hasFactor && !verified && path !== "/login/2fa") return redirect("/login/2fa");
  if (verified && (path === "/login" || path === "/login/2fa" || path === "/seguridad/2fa")) return redirect("/");

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|webp)$).*)"],
};
