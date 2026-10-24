"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Check, Field, Notice } from "@/components/ui";
import { rememberThisDevice } from "../../actions";
import { createClient } from "@/lib/supabase/client";

type Enrollment = { factorId: string; qr: string; secret: string };

export default function EnrollTwoFactorPage() {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      // Limpia intentos anteriores sin terminar para no acumular factores pendientes.
      const { data: factors } = await supabase.auth.mfa.listFactors();
      for (const f of factors?.all ?? []) {
        if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `App ROI ${Date.now()}` });
      if (error || !data) {
        setError("No se pudo iniciar la configuración. Recarga la página.");
        return;
      }
      const qr = data.totp.qr_code.startsWith("data:") ? data.totp.qr_code : `data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`;
      setEnrollment({ factorId: data.id, qr, secret: data.totp.secret });
    })();
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!enrollment) return;
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const code = String(form.get("code")).replace(/\s/g, "");
    const remember = form.get("remember") === "on";
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: enrollment.factorId, code });
    if (error) {
      setError("El código no coincide. Revisa que escaneaste el código QR de esta pantalla.");
      setBusy(false);
      return;
    }
    if (remember) await rememberThisDevice();
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Activa la verificación en dos pasos</h1>
      <p className="text-sm text-ink-2">
        Es obligatoria porque aquí guardas información financiera. Escanea el código con Google Authenticator, 1Password o
        similar, y escribe el código de 6 dígitos que aparece.
      </p>
      {enrollment ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrollment.qr} alt="Código QR para tu app de autenticación" className="mx-auto size-48 rounded-lg bg-white p-2" />
          <details className="text-sm text-ink-2">
            <summary className="cursor-pointer">No puedo escanear el código</summary>
            <p className="mt-2">Ingresa esta clave manualmente en tu app:</p>
            <code className="mt-1 block break-all rounded bg-surface-2 p-2 text-ink">{enrollment.secret}</code>
          </details>
          <Field label="Código" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
        </>
      ) : (
        !error && <p className="text-sm text-ink-3">Preparando código QR…</p>
      )}
      <Check name="remember" label="Recordar este dispositivo por 30 días" hint="No te pediremos el código aquí durante 30 días. No lo marques en un equipo compartido." defaultChecked />
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={busy || !enrollment} className="w-full">
        {busy ? "Activando…" : "Activar verificación"}
      </Button>
    </form>
  );
}
