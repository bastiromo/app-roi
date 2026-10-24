"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, Field, Notice } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState(params.get("error") === "no-autorizado" ? "Esta cuenta no tiene acceso a la app." : "");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const { error } = await createClient().auth.signInWithPassword({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (error) {
      setError("Correo o contraseña incorrectos.");
      setBusy(false);
      return;
    }
    router.replace("/"); // el proxy pide el código solo si este dispositivo no está recordado
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Ingresar</h1>
      <Field label="Correo" name="email" type="email" autoComplete="email" required />
      <Field label="Contraseña" name="password" type="password" autoComplete="current-password" required />
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Ingresando…" : "Ingresar"}
      </Button>
      <p className="pt-2 text-center text-sm text-ink-2">
        ¿Te invitaron?{" "}
        <Link href="/registro" className="font-medium text-ink underline">
          Crea tu cuenta
        </Link>
      </p>
    </form>
  );
}
