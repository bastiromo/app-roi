import type { SupabaseClient } from "@supabase/supabase-js";

/** Cookie httpOnly con el token aleatorio del dispositivo recordado (la base guarda solo su hash). */
export const TRUST_COOKIE = "roi_trusted_device";
export const TRUST_DAYS = 30;

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** ¿El token de la cookie corresponde a un dispositivo recordado vigente del usuario de esta sesión? */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isTrustedDevice(supabase: SupabaseClient<any, any, any>, token: string | undefined): Promise<boolean> {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return false;
  const { data, error } = await supabase.rpc("check_trusted_device", { p_hash: await sha256Hex(token) });
  return !error && data === true;
}

/** Nombre legible del dispositivo a partir del navegador: "iPhone · Safari". */
export function deviceLabel(ua: string): string {
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : "Dispositivo";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /CriOS|Chrome\//.test(ua)
      ? "Chrome"
      : /FxiOS|Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : null;
  return browser ? `${os} · ${browser}` : os;
}
