import "server-only";
import { requireUser } from "@/lib/auth";

export interface FxLookup {
  rate: string; // CLP por 1 USD
  date: string; // fecha del valor usado (puede ser anterior si el día pedido no tuvo publicación)
  source: "dolar_observado";
}

/** Parsea la respuesta de mindicador.cl: { serie: [{ fecha, valor }] }. */
export function parseMindicador(json: unknown): { fecha: string; valor: string } | null {
  const serie = (json as { serie?: { fecha?: string; valor?: number }[] })?.serie;
  const first = Array.isArray(serie) ? serie[0] : undefined;
  if (!first || typeof first.valor !== "number" || !(first.valor > 0)) return null;
  return { fecha: String(first.fecha ?? "").slice(0, 10), valor: first.valor.toFixed(2) };
}

function ddmmyyyy(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function minusDays(iso: string, n: number) {
  const t = new Date(`${iso}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() - n);
  return t.toISOString().slice(0, 10);
}

/**
 * Dólar observado (Banco Central de Chile, vía mindicador.cl) para una fecha.
 * Fines de semana y feriados no tienen publicación: usa el último día hábil anterior (hasta 7 días).
 * Primero busca en la caché fx_rates del usuario. Si el servicio falla, devuelve null y el usuario lo ingresa.
 */
export async function lookupUsdClp(isoDate: string): Promise<FxLookup | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const { supabase } = await requireUser();

  const { data: cached } = await supabase
    .from("fx_rates")
    .select("rate_date,usd_clp::text")
    .eq("source", "dolar_observado")
    .lte("rate_date", isoDate)
    .gte("rate_date", minusDays(isoDate, 7))
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle<{ rate_date: string; usd_clp: string }>();
  if (cached?.rate_date === isoDate) return { rate: cached.usd_clp, date: cached.rate_date, source: "dolar_observado" };

  for (let i = 0; i <= 7; i++) {
    const day = minusDays(isoDate, i);
    try {
      const res = await fetch(`https://mindicador.cl/api/dolar/${ddmmyyyy(day)}`, {
        signal: AbortSignal.timeout(4000),
        next: { revalidate: 86400 },
      });
      if (!res.ok) continue;
      const parsed = parseMindicador(await res.json());
      if (!parsed) continue;
      await supabase.from("fx_rates").upsert(
        { rate_date: day, usd_clp: parsed.valor, source: "dolar_observado" },
        { onConflict: "user_id,rate_date,source", ignoreDuplicates: true },
      );
      return { rate: parsed.valor, date: day, source: "dolar_observado" };
    } catch {
      break; // servicio caído: no insistir día por día
    }
  }
  return cached ? { rate: cached.usd_clp, date: cached.rate_date, source: "dolar_observado" } : null;
}
