"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { leaveHalfSession } from "@/app/(auth)/actions";
import { createClient } from "@/lib/supabase/client";

/**
 * "← Volver" en las pantallas de 2FA: cierra la sesión a medio iniciar (solo contraseña)
 * y vuelve al inicio de sesión, para poder entrar con otro correo.
 */
export function BackToLogin() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function back() {
    setBusy(true);
    // En el servidor (borra las cookies con certeza) y en el navegador; si algo falla, se vuelve igual
    await Promise.race([leaveHalfSession().catch(() => null), new Promise((r) => setTimeout(r, 6000))]);
    await createClient().auth.signOut({ scope: "local" }).catch(() => null);
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={back}
      disabled={busy}
      className="-ml-2 inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {busy ? "Volviendo…" : "Volver"}
    </button>
  );
}
