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

/** Serie completa de mindicador.cl (ej. /api/dolar/2026) → [{ fecha, valor }]. */
export function parseSeries(json: unknown): { fecha: string; valor: string }[] {
  const serie = (json as { serie?: { fecha?: string; valor?: number }[] })?.serie;
  if (!Array.isArray(serie)) return [];
  return serie
    .filter((p) => typeof p.valor === "number" && p.valor > 0 && typeof p.fecha === "string")
    .map((p) => ({ fecha: String(p.fecha).slice(0, 10), valor: p.valor!.toFixed(2) }));
}

/** El valor publicado para la fecha o, si ese día no hubo (fin de semana, feriado), el último hábil anterior (hasta 7 días). */
export function pickRate(series: { fecha: string; valor: string }[], isoDate: string): { fecha: string; valor: string } | null {
  const from = minusDays(isoDate, 7);
  let best: { fecha: string; valor: string } | null = null;
  for (const p of series) if (p.fecha <= isoDate && p.fecha >= from && (!best || p.fecha > best.fecha)) best = p;
  return best;
}

// Serie anual en memoria (una importación consulta muchas fechas del mismo año)
const yearSeries = new Map<string, Promise<{ fecha: string; valor: string }[]>>();
function fetchYear(year: string) {
  if (!yearSeries.has(year)) {
    const p = fetch(`https://mindicador.cl/api/dolar/${year}`, { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } })
      .then((r) => (r.ok ? r.json() : null))
      .then(parseSeries)
      .catch(() => []);
    yearSeries.set(year, p);
    // Si falló, no se guarda el vacío: el siguiente intento vuelve a consultar
    p.then((s) => s.length === 0 && yearSeries.delete(year));
  }
  return yearSeries.get(year)!;
}

/**
 * Dólar observado (Banco Central de Chile, vía mindicador.cl) para una fecha.
 * Fines de semana y feriados no tienen publicación: usa el último día hábil anterior (hasta 7 días).
 * Orden: caché fx_rates del usuario → consulta del día → serie del año completo (la consulta por día
 * de mindicador.cl a veces falla para algunas fechas). Si todo falla, devuelve null y el usuario lo ingresa.
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

  const save = (rows: { fecha: string; valor: string }[]) =>
    supabase.from("fx_rates").upsert(
      rows.map((r) => ({ rate_date: r.fecha, usd_clp: r.valor, source: "dolar_observado" })),
      { onConflict: "user_id,rate_date,source", ignoreDuplicates: true },
    );

  // 1) Consulta del día exacto
  try {
    const res = await fetch(`https://mindicador.cl/api/dolar/${ddmmyyyy(isoDate)}`, { signal: AbortSignal.timeout(4000), next: { revalidate: 86400 } });
    const parsed = res.ok ? parseMindicador(await res.json()) : null;
    if (parsed && parsed.fecha === isoDate) {
      await save([parsed]);
      return { rate: parsed.valor, date: isoDate, source: "dolar_observado" };
    }
  } catch {
    // sigue con la serie anual
  }

  // 2) Serie del año (y del anterior si la fecha cae en la primera semana de enero)
  const year = isoDate.slice(0, 4);
  const series = [...(await fetchYear(year))];
  if (isoDate.slice(5) <= "01-08") series.push(...(await fetchYear(String(Number(year) - 1))));
  const picked = pickRate(series, isoDate);
  if (picked) {
    await save(series.filter((p) => p.fecha.startsWith(year)));
    return { rate: picked.valor, date: picked.fecha, source: "dolar_observado" };
  }

  return cached ? { rate: cached.usd_clp, date: cached.rate_date, source: "dolar_observado" } : null;
}
