/**
 * Filtro por fechas sobre la fecha que muestra la lista: la de pago si existe, si no la de solicitud.
 * Devuelve la condición para PostgREST (.or) o null si no hay fechas válidas.
 */
export function payoutDateFilter(desde?: string, hasta?: string): string | null {
  const iso = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const from = iso(desde);
  const to = iso(hasta);
  if (!from && !to) return null;
  const range = (col: string) => [from && `${col}.gte.${from}`, to && `${col}.lte.${to}`].filter(Boolean).join(",");
  return `and(paid_on.not.is.null,${range("paid_on")}),and(paid_on.is.null,${range("requested_on")})`;
}
