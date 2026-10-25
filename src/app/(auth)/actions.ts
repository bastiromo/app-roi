"use server";

import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { deviceLabel, sha256Hex, TRUST_COOKIE, TRUST_DAYS } from "@/lib/trusted-device";

/** Recuerda este dispositivo por 30 días. Solo se llama justo después de verificar el código 2FA. */
export async function rememberThisDevice(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.aal !== "aal2") return { ok: false }; // exige haber verificado el código en esta sesión

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const label = deviceLabel((await headers()).get("user-agent") ?? "");
  const { error } = await supabase.from("trusted_devices").insert({ token_hash: await sha256Hex(token), label });
  if (error) return { ok: false };

  (await cookies()).set(TRUST_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: TRUST_DAYS * 24 * 60 * 60,
  });
  return { ok: true };
}

/** "Volver" desde las pantallas de 2FA: cierra la sesión a medio iniciar (solo contraseña). */
export async function leaveHalfSession(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
