"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, Field, Notice, Tag } from "@/components/ui";
import { commitImport, type ImportPreview, type ImportResult, previewImport, undoImport } from "./actions";

const STATE_TAG = {
  new: { label: "Nuevo", tone: "credit" as const },
  duplicate: { label: "Ya existe", tone: "neutral" as const },
  error: { label: "Error", tone: "debit" as const },
};

export function Importer() {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fallbackFx, setFallbackFx] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
    setPreview(null);
    setResult(null);
  }

  const review = () =>
    start(async () => {
      setResult(null);
      setPreview(await previewImport(text, fallbackFx || null));
    });

  const confirm = () =>
    start(async () => {
      const r = await commitImport(text, fallbackFx || null);
      setResult(r);
      if (r.ok) setPreview(null);
    });

  const undo = (batch: string) =>
    start(async () => {
      setResult(await undoImport(batch));
    });

  const isPayouts = preview?.kind === "payouts";

  return (
    <div className="space-y-6">
      {result && (
        <div
          role={result.ok ? "status" : "alert"}
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${result.ok ? "border-credit/40 text-credit" : "border-debit/40 text-debit"}`}
        >
          <span>{result.message}</span>
          {result.ok && result.batch && (
            <span className="flex gap-4">
              <Link href={isPayouts ? "/payouts" : "/gastos"} className="font-semibold text-ink underline">
                Ver
              </Link>
              <button onClick={() => undo(result.batch!)} disabled={pending} className="font-semibold text-ink underline">
                Deshacer importación
              </button>
            </span>
          )}
        </div>
      )}

      <section className="space-y-4 rounded-3xl border border-line bg-surface shadow-card p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex h-10 cursor-pointer items-center rounded-full border border-line px-4 text-sm font-medium hover:border-ink-3">
            Elegir archivo CSV
            <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <span className="text-sm text-ink-3">{fileName ?? "o pega el contenido abajo"}</span>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-2">Contenido</span>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview(null);
            }}
            rows={6}
            spellCheck={false}
            placeholder={"firm,external_ref,occurred_on,category,description,amount,currency,status\nLucid Trading,11180654,2026-10-15,evaluacion,LucidFlex 50K Rithmic,105.20,USD,pagado"}
            className="w-full rounded-lg border border-line bg-surface p-3 font-mono text-xs text-ink focus:border-focus focus:outline-none"
          />
        </label>
        <Button onClick={review} disabled={!text.trim() || pending}>
          {pending && !preview ? "Revisando…" : "Revisar"}
        </Button>
      </section>

      {preview && (
        <section className="space-y-4" aria-labelledby="vista-previa">
          <h2 id="vista-previa" className="font-semibold">
            Vista previa: {preview.kind === "payouts" ? "payouts" : preview.kind === "expenses" ? "gastos" : "archivo"}
          </h2>

          {preview.kind === null ? (
            <Notice tone="error">{preview.errors[0]?.message}</Notice>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 text-sm">
                <Tag tone="credit">{preview.counts.new} nuevos</Tag>
                <Tag>{preview.counts.duplicate} ya existen</Tag>
                {preview.counts.error > 0 && <Tag tone="debit">{preview.counts.error} con error</Tag>}
                <span className="num ml-2 text-ink-2">
                  {isPayouts ? "Recibido de los nuevos: " : "Costo pagado de los nuevos: "}
                  <strong className={isPayouts ? "text-credit" : "text-debit"}>{preview.totalUsd}</strong>
                </span>
              </div>

              {preview.newAccounts.length > 0 && (
                <Notice>
                  Se crearán {preview.newAccounts.length} cuentas financiadas que no existen: {preview.newAccounts.join(", ")}.
                </Notice>
              )}

              {preview.missingFxDates.length > 0 && (
                <div className="space-y-3 rounded-lg border border-estimate/50 p-3">
                  <p className="text-sm text-estimate">
                    No pude obtener el dólar observado de {preview.missingFxDates.length} fecha(s). Escribe un valor para usar en esas
                    fechas y vuelve a revisar.
                  </p>
                  <div className="max-w-xs">
                    <Field label="Dólar en pesos" inputMode="decimal" value={fallbackFx} onChange={(e) => setFallbackFx(e.target.value)} />
                  </div>
                </div>
              )}

              {preview.errors.length > 0 && (
                <ul className="space-y-1 text-sm text-debit">
                  {preview.errors.map((e) => (
                    <li key={e.line}>
                      Línea {e.line}: {e.message}
                    </li>
                  ))}
                </ul>
              )}

              <div className="max-h-[28rem] overflow-auto rounded-3xl border border-line bg-surface shadow-card">
                <table className="w-full min-w-[48rem] text-sm">
                  <thead className="sticky top-0 bg-surface text-left text-ink-2">
                    <tr className="border-b border-line">
                      <th className="px-3 py-2 font-medium">Línea</th>
                      <th className="px-3 py-2 font-medium">Fecha</th>
                      <th className="px-3 py-2 font-medium">{isPayouts ? "Cuenta" : "Orden"}</th>
                      <th className="px-3 py-2 font-medium">Estado</th>
                      <th className="px-3 py-2 text-right font-medium">{isPayouts ? "Retiro" : "Monto"}</th>
                      <th className="px-3 py-2 text-right font-medium">{isPayouts ? "Recibido" : "En USD"}</th>
                      <th className="px-3 py-2 font-medium">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.line} className={`border-b border-line last:border-0 ${r.state === "new" ? "" : "text-ink-3"}`}>
                        <td className="num px-3 py-2">{r.line}</td>
                        <td className="num whitespace-nowrap px-3 py-2">{r.date.split("-").reverse().join("-")}</td>
                        <td className="px-3 py-2">
                          {r.who}
                          {r.newAccount && <span className="ml-2 text-xs text-ink-2">(nueva)</span>}
                        </td>
                        <td className="px-3 py-2">{r.status}</td>
                        <td className="num whitespace-nowrap px-3 py-2 text-right">{r.amount}</td>
                        <td className="num whitespace-nowrap px-3 py-2 text-right">
                          {r.usd ? <span className={r.estimated ? "est" : ""}>{r.usd}</span> : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <Tag tone={STATE_TAG[r.state].tone}>{STATE_TAG[r.state].label}</Tag>
                          {r.note && <span className="ml-2 text-xs">{r.note}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={confirm} disabled={preview.counts.new === 0 || pending}>
                  {pending ? "Importando…" : `Importar ${preview.counts.new} ${isPayouts ? "payouts" : "gastos"}`}
                </Button>
                <span className="text-sm text-ink-3">Las filas que ya existen o tienen error se omiten.</span>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
