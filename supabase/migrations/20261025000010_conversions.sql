-- Ventas de cripto por pesos (P2P / exchange): lo que realmente obtuviste en CLP.
-- Es informativo: no cambia el ROI (que sigue valorizado con el dólar observado del día del pago).
alter table public.fx_conversions
  add column ref_usd_clp numeric(12,4) check (ref_usd_clp > 0);  -- dólar observado del día, para comparar
comment on column public.fx_conversions.ref_usd_clp is
  'Dólar observado del día de la venta (referencia). La diferencia con el precio obtenido es informativa.';

-- El n.º de orden P2P no se repite (evita registrar dos veces la misma venta)
create unique index fx_conversions_tx_ref_uq on public.fx_conversions (user_id, tx_ref)
  where tx_ref is not null and deleted_at is null;

