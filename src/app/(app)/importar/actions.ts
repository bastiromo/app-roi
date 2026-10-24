"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { lookupUsdClp } from "@/lib/fx";
import { buildPreview, type ImportPreview, type ImportResult, revertBatch, runImport } from "@/lib/import";

export type { ImportPreview, ImportResult, PreviewRow } from "@/lib/import";

function refresh() {
  for (const p of ["/gastos", "/payouts", "/cuentas", "/"]) revalidatePath(p);
}

export async function previewImport(text: string, fallbackFx: string | null): Promise<ImportPreview> {
  const { supabase } = await requireUser();
  return buildPreview(supabase, lookupUsdClp, text, fallbackFx);
}

export async function commitImport(text: string, fallbackFx: string | null): Promise<ImportResult> {
  const { supabase } = await requireUser();
  const r = await runImport(supabase, lookupUsdClp, text, fallbackFx);
  if (r.ok) refresh();
  return r;
}

export async function undoImport(batch: string): Promise<ImportResult> {
  const { supabase } = await requireUser();
  const r = await revertBatch(supabase, batch);
  refresh();
  return r;
}
