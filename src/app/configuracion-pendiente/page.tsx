export default function PendingConfigPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Falta conectar la base de datos</h1>
      <p className="mt-3 text-ink-2">
        La app no encuentra las variables <code>NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
        <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>. Agrégalas en Vercel (Settings → Environment Variables) y vuelve a
        desplegar.
      </p>
    </main>
  );
}
