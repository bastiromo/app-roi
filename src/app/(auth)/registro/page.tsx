"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Notice } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("database error") || m.includes("invitación")) {
    return "Este correo no tiene una invitación vigente. Pide a quien te invitó que la cree o la renueve (duran 14 días).";
  }
  if (m.includes("already registered") || m.includes("already exists")) return "Ese correo ya tiene una cuenta. Ingresa desde la pantalla de inicio.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) {
    return "El registro está desactivado en el servidor. Avísale al administrador de la app.";
  }
  if (m.includes("password")) return "La contraseña no cumple los requisitos: usa al menos 10 caracteres.";
  return `No se pudo crear la cuenta: ${message}`;
}

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setInfo("");
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    if (password.length < 10) return setError("Usa una contraseña de al menos 10 caracteres.");
    if (password !== String(form.get("password2"))) return setError("Las contraseñas no coinciden.");

    setBusy(true);
    const { data, error } = await createClient().auth.signUp({ email, password });
    setBusy(false);
    if (error) return setError(friendly(error.message));
    if (!data.session) {
      // Supabase con "Confirm email" activado: la cuenta existe pero falta confirmar el correo
      return setInfo("Cuenta creada. Revisa tu correo para confirmarla y luego ingresa.");
    }
    router.replace("/seguridad/2fa");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Crear cuenta</h1>
      <p className="text-sm text-ink-2">
        Usa el correo con el que te invitaron. Tus datos serán solo tuyos: nadie más los ve.
      </p>
      <Field label="Correo invitado" name="email" type="email" autoComplete="email" required />
      <Field label="Contraseña" name="password" type="password" autoComplete="new-password" minLength={10} required hint="Mínimo 10 caracteres." />
      <Field label="Repite la contraseña" name="password2" type="password" autoComplete="new-password" required />
      {error && <Notice tone="error">{error}</Notice>}
      {info && <Notice tone="success">{info}</Notice>}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Creando cuenta…" : "Crear cuenta"}
      </Button>
      <p className="pt-2 text-center text-sm text-ink-2">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-ink underline">
          Ingresar
        </Link>
      </p>
    </form>
  );
}
