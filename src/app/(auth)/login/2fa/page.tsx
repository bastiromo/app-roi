"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Check, Field, Notice } from "@/components/ui";
import { rememberThisDevice } from "../../actions";
import { createClient } from "@/lib/supabase/client";

export default function TwoFactorPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const form = new FormData(e.currentTarget);
    const code = String(form.get("code")).replace(/\s/g, "");
    const remember = form.get("remember") === "on";
    const { data } = await supabase.auth.mfa.listFactors();
    const factor = data?.totp[0];
    if (!factor) {
      router.replace("/seguridad/2fa");
      return;
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (error) {
      setError("El código no es válido o ya expiró. Usa el código que se muestra ahora en tu app.");
      setBusy(false);
      return;
    }
    if (remember) await rememberThisDevice();
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Código de verificación</h1>
      <p className="text-sm text-ink-2">Escribe el código de 6 dígitos de tu app de autenticación.</p>
      <Field label="Código" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus />
      <Check name="remember" label="Recordar este dispositivo por 30 días" hint="No te pediremos el código aquí durante 30 días. No lo marques en un equipo compartido." defaultChecked />
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Verificando…" : "Verificar"}
      </Button>
    </form>
  );
}
