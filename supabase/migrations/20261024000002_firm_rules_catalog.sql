-- =============================================================================
-- Etapa 2: reglas de reparto escalonadas, estado de configuración y catálogo.
-- =============================================================================

-- Regla escalonada opcional: "pct_before % hasta threshold retirado (acumulado en la empresa),
-- luego default_trader_share_pct %". Ej. Apex: 100 % hasta USD 25.000, luego 90 %.
alter table public.firms
  add column split_tier_threshold numeric(18,2) check (split_tier_threshold > 0),
  add column split_tier_pct_before numeric(5,2) check (split_tier_pct_before between 0 and 100),
  add column transfer_fee_is_estimate boolean not null default true,
  add column is_configured boolean not null default true,
  add constraint firms_tier_pair check ((split_tier_threshold is null) = (split_tier_pct_before is null));

-- Un % mezclado al cruzar el umbral (ej. 93,333…) necesita más decimales.
-- La vista cash_flows depende de payouts (vía la función), así que se recrea alrededor del cambio.
alter table public.payouts alter column trader_share_pct type numeric(9,6);

-- Empresas iniciales para un usuario (idempotente: no duplica ni pisa ediciones).
create or replace function app.seed_default_firms(p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.firms (user_id, name, website, default_trader_share_pct, split_tier_threshold, split_tier_pct_before,
                            default_transfer_fee, transfer_fee_is_estimate, is_configured, is_active, payout_rules_notes)
  select p_user, f.name, f.website, f.pct, f.tier_threshold, f.tier_before, f.fee, f.fee_est, f.configured, f.active, f.notes
  from (values
    ('Lucid Trading', null::text, 90::numeric, null::numeric, null::numeric, 25::numeric, false, true, true,
       '90 % para el trader. Comisión de envío fija USD 25 por payout (confirmada).'),
    ('Topstep', null, 90, null, null, 25, true, true, true,
       'Registro posterior al 12-01-2026: 90/10 en todos los payouts. Comisión de retiro: estimada.'),
    ('Tradeify', null, 90, null, null, 25, true, true, true,
       'Select 50K (consistencia 50 %, USD 144). 90 % en Growth/Lightning/Select; 80 % en Elite. Comisión: estimada.'),
    ('Apex Trader Funding', null, 90, 25000, 100, 25, true, true, true,
       '100 % hasta USD 25.000 retirados en total; luego 90 %. Comisión: estimada.'),
    ('Alpha Futures', null, 100, null, null, 0, true, false, false, null),
    ('FundedNext Futures', null, 100, null, null, 0, true, false, false, null),
    ('My Funded Futures', null, 100, null, null, 0, true, false, false, null),
    ('Top One Futures', null, 100, null, null, 0, true, false, false, null),
    ('Traders Launch', null, 100, null, null, 0, true, false, false, null),
    ('Funded Futures Family', null, 100, null, null, 0, true, false, false, null),
    ('FuturesElite', null, 100, null, null, 0, true, false, false, null)
  ) as f(name, website, pct, tier_threshold, tier_before, fee, fee_est, configured, active, notes)
  where not exists (
    select 1 from public.firms x where x.user_id = p_user and lower(x.name) = lower(f.name) and x.deleted_at is null
  );
end $$;

revoke all on function app.seed_default_firms(uuid) from public, anon, authenticated;

-- Siembra para los usuarios existentes (hoy: solo Basti).
select app.seed_default_firms(id) from auth.users;
