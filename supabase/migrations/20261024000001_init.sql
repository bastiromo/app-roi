-- =============================================================================
-- App ROI — esquema inicial
-- Reglas de diseño:
--   * Cada fila pertenece a un usuario (RLS). Nada financiero se borra físicamente
--     (borrado lógico con deleted_at; DELETE revocado en tablas de dinero).
--   * Montos numeric exactos; cada movimiento guarda moneda y tipo de cambio de su fecha.
--   * Toda modificación de datos financieros queda en audit_log (inmutable).
--   * El dinero recibido solo existe en receipts; un payout es el proceso, no el dinero.
-- =============================================================================

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.currency_code    as enum ('USD', 'CLP', 'USDT', 'USDC');
create type public.fx_source        as enum ('manual', 'dolar_observado', 'liquidacion', 'supuesto');
create type public.account_phase    as enum ('evaluacion', 'financiada', 'live');
create type public.account_status   as enum ('activa', 'aprobada', 'suspendida', 'perdida', 'cerrada');
create type public.expense_kind     as enum ('cost', 'refund');
create type public.expense_status   as enum ('pending', 'paid', 'failed', 'void');
create type public.expense_category as enum (
  'evaluacion', 'activacion', 'reset', 'suscripcion', 'plataforma',
  'datos_mercado', 'comision_bancaria', 'comision_red', 'otros');
create type public.payout_status    as enum ('draft', 'requested', 'approved', 'paid', 'rejected', 'cancelled');
create type public.receipt_basis    as enum ('actual', 'estimated');
create type public.payment_method_type as enum ('tarjeta', 'cripto', 'banco', 'procesador', 'otro');
create type public.tax_payment_type as enum ('anual', 'provisional', 'retencion', 'otro');

-- ---------------------------------------------------------------------------
-- Funciones comunes
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Catálogos
-- ---------------------------------------------------------------------------
create table public.firms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  website text,
  default_trader_share_pct numeric(5,2) not null default 100 check (default_trader_share_pct between 0 and 100),
  default_transfer_fee numeric(18,4) not null default 0 check (default_transfer_fee >= 0),
  transfer_fee_currency public.currency_code not null default 'USD',
  payout_rules_notes text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index firms_name_uq on public.firms (user_id, lower(name)) where deleted_at is null;

create table public.platforms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index platforms_name_uq on public.platforms (user_id, lower(name)) where deleted_at is null;

-- Solo etiquetas: nunca números completos de tarjeta/cuenta, claves ni frases semilla.
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null check (length(trim(label)) > 0 and label !~ '\d{8,}'),
  type public.payment_method_type not null default 'otro',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Cuentas
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  firm_id uuid not null references public.firms (id),
  label text not null check (length(trim(label)) > 0),
  external_id text,                       -- ID que entrega la empresa (ej. LFF050-…)
  plan_name text,                         -- ej. "LucidFlex 50K Rithmic"
  nominal_size numeric(18,2),             -- INFORMATIVO: nunca entra en cálculos de dinero
  nominal_currency public.currency_code not null default 'USD',
  phase public.account_phase not null default 'evaluacion',
  status public.account_status not null default 'activa',
  origin_account_id uuid references public.accounts (id),
  platform_id uuid references public.platforms (id),
  strategy_id uuid references public.strategies (id),
  opened_on date,
  closed_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, firm_id),
  check (origin_account_id is distinct from id),
  check (closed_on is null or opened_on is null or closed_on >= opened_on)
);
create unique index accounts_external_uq on public.accounts (user_id, firm_id, external_id)
  where external_id is not null and deleted_at is null;

create table public.account_status_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id),
  phase public.account_phase not null,
  status public.account_status not null,
  changed_at timestamptz not null default now()
);

create or replace function app.track_account_status() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.phase is distinct from old.phase or new.status is distinct from old.status then
    insert into public.account_status_history (user_id, account_id, phase, status)
    values (new.user_id, new.id, new.phase, new.status);
  end if;
  return new;
end $$;

create table public.account_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id),
  as_of date not null,
  balance numeric(18,2) not null,         -- dinero NO realizado: nunca se suma al ROI
  currency public.currency_code not null default 'USD',
  created_at timestamptz not null default now(),
  unique (account_id, as_of)
);

-- ---------------------------------------------------------------------------
-- Gastos y reembolsos
-- ---------------------------------------------------------------------------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.expense_kind not null default 'cost',
  refund_of_id uuid references public.expenses (id),
  status public.expense_status not null default 'paid',
  occurred_on date not null,
  firm_id uuid references public.firms (id),   -- null = costo general no asignado
  account_id uuid references public.accounts (id),
  category public.expense_category not null,
  description text,
  amount numeric(18,4) not null check (amount > 0),
  currency public.currency_code not null,
  usd_rate numeric(18,8) check (usd_rate > 0),      -- USD por unidad (stablecoins)
  fx_usd_clp numeric(14,4) not null check (fx_usd_clp > 0),
  fx_source public.fx_source not null default 'manual',
  settled_amount numeric(18,4) check (settled_amount > 0),
  settled_currency public.currency_code,
  payment_method_id uuid references public.payment_methods (id),
  external_ref text,                                -- n.º de orden de la empresa
  tx_hash text,
  receipt_path text,
  source text,                                      -- origen del dato (manual, import, screenshot…)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((kind = 'refund') = (refund_of_id is not null)),
  check ((settled_amount is null) = (settled_currency is null)),
  check (account_id is null or firm_id is not null)
);
create unique index expenses_external_ref_uq
  on public.expenses (user_id, coalesce(firm_id, '00000000-0000-0000-0000-000000000000'::uuid), external_ref)
  where external_ref is not null and deleted_at is null;
create unique index expenses_tx_hash_uq on public.expenses (user_id, tx_hash)
  where tx_hash is not null and deleted_at is null;
create index expenses_date_idx on public.expenses (user_id, occurred_on);

-- ---------------------------------------------------------------------------
-- Payouts (proceso) → receipts (dinero recibido) vía receipt_allocations
-- ---------------------------------------------------------------------------
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  firm_id uuid not null,
  account_id uuid not null,
  status public.payout_status not null default 'draft',
  requested_on date not null,
  approved_on date,
  paid_on date,
  profit_base numeric(18,4) check (profit_base >= 0),
  requested_amount numeric(18,4) not null check (requested_amount > 0), -- retiro bruto que muestra la empresa
  approved_amount numeric(18,4) check (approved_amount >= 0),
  trader_share_pct numeric(5,2) not null check (trader_share_pct between 0 and 100),
  firm_fee_amount numeric(18,4) not null default 0 check (firm_fee_amount >= 0),
  currency public.currency_code not null default 'USD',
  notes text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (account_id, firm_id) references public.accounts (id, firm_id),
  check (approved_on is null or approved_on >= requested_on),
  check (paid_on is null or paid_on >= requested_on)
);
create index payouts_account_idx on public.payouts (account_id);

-- Neto estimado: retiro × % trader − comisión empresa (informativo)
create or replace function app.payout_estimated_net(p public.payouts) returns numeric
language sql immutable as $$
  select p.requested_amount * p.trader_share_pct / 100 - p.firm_fee_amount
$$;

-- Transiciones de estado válidas
create or replace function app.check_payout_transition() returns trigger
language plpgsql as $$
begin
  if new.status = old.status then return new; end if;
  if not (
    (old.status = 'draft'     and new.status in ('requested', 'cancelled')) or
    (old.status = 'requested' and new.status in ('approved', 'paid', 'rejected', 'cancelled')) or
    (old.status = 'approved'  and new.status in ('paid', 'rejected', 'cancelled'))
  ) then
    raise exception 'Transición de payout no permitida: % → %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  received_on date not null,
  basis public.receipt_basis not null default 'actual',
  amount numeric(18,4) not null check (amount >= 0),   -- lo que llegó, ya neto de reparto y comisiones
  currency public.currency_code not null,
  usd_rate numeric(18,8) check (usd_rate > 0),
  fx_usd_clp numeric(14,4) not null check (fx_usd_clp > 0),
  fx_source public.fx_source not null default 'manual',
  processor_fee numeric(18,4) not null default 0 check (processor_fee >= 0), -- informativo: ya descontado
  payment_method_id uuid references public.payment_methods (id),
  tx_hash text,
  receipt_path text,
  notes text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index receipts_tx_hash_uq on public.receipts (user_id, tx_hash)
  where tx_hash is not null and deleted_at is null;

create table public.receipt_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  receipt_id uuid not null references public.receipts (id),
  payout_id uuid not null references public.payouts (id),
  amount numeric(18,4) check (amount >= 0),   -- null = proporcional al neto estimado
  created_at timestamptz not null default now(),
  unique (receipt_id, payout_id)
);

-- Solo un payout pagado puede tener dinero recibido
create or replace function app.check_allocation_payout_paid() returns trigger
language plpgsql as $$
declare st public.payout_status;
begin
  select status into st from public.payouts where id = new.payout_id;
  if st is distinct from 'paid' then
    raise exception 'Solo un payout pagado puede tener dinero recibido (estado actual: %)', st
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- Un payout con dinero recibido no puede dejar de estar pagado
create or replace function app.check_paid_payout_keeps_receipts() returns trigger
language plpgsql as $$
begin
  if old.status = 'paid' and new.status <> 'paid'
     and exists (select 1 from public.receipt_allocations where payout_id = new.id) then
    raise exception 'El payout tiene dinero recibido asociado; elimina primero la asignación'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create table public.fx_conversions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  converted_on date not null,
  from_amount numeric(18,4) not null check (from_amount > 0),
  from_currency public.currency_code not null,
  to_amount numeric(18,4) not null check (to_amount > 0),
  to_currency public.currency_code not null,
  fee_amount numeric(18,4) not null default 0 check (fee_amount >= 0),
  fee_currency public.currency_code,
  exchange_label text,
  tx_ref text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (from_currency <> to_currency)
);

-- ---------------------------------------------------------------------------
-- Impuestos (registro real) y supuestos (siempre estimación)
-- ---------------------------------------------------------------------------
create table public.tax_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tax_year int not null check (tax_year between 2000 and 2100),
  paid_on date not null,
  type public.tax_payment_type not null default 'anual',
  amount numeric(18,4) not null check (amount > 0),
  currency public.currency_code not null default 'CLP',
  fx_usd_clp numeric(14,4) not null check (fx_usd_clp > 0),
  fx_source public.fx_source not null default 'manual',
  payout_id uuid references public.payouts (id),
  receipt_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.tax_assumptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tax_year int not null check (tax_year between 2000 and 2100),
  estimated_rate_pct numeric(5,2) not null check (estimated_rate_pct between 0 and 100),
  basis text not null,
  notes text,
  is_estimate boolean not null default true check (is_estimate),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tax_year)
);

create table public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rate_date date not null,
  usd_clp numeric(14,4) not null check (usd_clp > 0),
  source public.fx_source not null,
  created_at timestamptz not null default now(),
  unique (user_id, rate_date, source)
);

-- ---------------------------------------------------------------------------
-- Auditoría (solo inserción, vía trigger)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  table_name text not null,
  row_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_values jsonb,
  new_values jsonb,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now()
);
create index audit_log_row_idx on public.audit_log (table_name, row_id);

create or replace function app.audit_row() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare rec jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (user_id, table_name, row_id, action, old_values, new_values, changed_by)
  values (
    (rec ->> 'user_id')::uuid,
    tg_table_name,
    (rec ->> 'id')::uuid,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['firms','platforms','payment_methods','strategies','accounts','expenses',
                           'payouts','receipts','fx_conversions','tax_payments','tax_assumptions'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app.touch_updated_at()',
                   t || '_touch', t);
  end loop;
  foreach t in array array['firms','accounts','expenses','payouts','receipts','receipt_allocations',
                           'fx_conversions','tax_payments','tax_assumptions','account_balance_snapshots'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_row()',
                   t || '_audit', t);
  end loop;
end $$;

create trigger accounts_status_history after insert or update on public.accounts
  for each row execute function app.track_account_status();
create trigger payouts_transition before update of status on public.payouts
  for each row execute function app.check_payout_transition();
create trigger payouts_keep_receipts before update of status on public.payouts
  for each row execute function app.check_paid_payout_keeps_receipts();
create trigger allocations_require_paid before insert or update on public.receipt_allocations
  for each row execute function app.check_allocation_payout_paid();

-- ---------------------------------------------------------------------------
-- Seguridad: RLS + permisos
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['firms','platforms','payment_methods','strategies','accounts',
                           'account_balance_snapshots','expenses','payouts','receipts','receipt_allocations',
                           'fx_conversions','tax_payments','tax_assumptions','fx_rates'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy own_rows on public.%I for all to authenticated
                    using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;

  -- Lectura propia, sin escritura directa
  foreach t in array array['audit_log','account_status_history'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy own_rows_read on public.%I for select to authenticated using (user_id = auth.uid())', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;

  -- Dinero: sin borrado físico (se usa deleted_at)
  foreach t in array array['firms','accounts','expenses','payouts','receipts','fx_conversions','tax_payments'] loop
    execute format('revoke delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end $$;

revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Vista de flujos de caja: toda cifra del dashboard es una suma sobre esta vista
-- ---------------------------------------------------------------------------
create view public.cash_flows with (security_invoker = true) as
with alloc as (
  select
    ra.receipt_id, ra.payout_id, p.firm_id, p.account_id,
    coalesce(
      ra.amount,
      r.amount * case
        when sum(app.payout_estimated_net(p)) over (partition by ra.receipt_id) = 0
          then 1.0 / count(*) over (partition by ra.receipt_id)
        else app.payout_estimated_net(p) / sum(app.payout_estimated_net(p)) over (partition by ra.receipt_id)
      end
    ) as share
  from public.receipt_allocations ra
  join public.receipts r on r.id = ra.receipt_id and r.deleted_at is null
  join public.payouts p on p.id = ra.payout_id and p.deleted_at is null and p.status = 'paid'
),
base as (
  select e.user_id, e.occurred_on as flow_date,
         case e.kind when 'cost' then 'costo' else 'reembolso' end as flow_type,
         case e.kind when 'cost' then -1 else 1 end as direction,
         e.firm_id, e.account_id, 'expenses'::text as source_table, e.id as source_id,
         e.amount, e.currency, e.usd_rate, e.fx_usd_clp, false as is_estimated
  from public.expenses e
  where e.status = 'paid' and e.deleted_at is null
  union all
  select r.user_id, r.received_on, 'payout_recibido', 1,
         a.firm_id, a.account_id, 'receipts', r.id,
         a.share, r.currency, r.usd_rate, r.fx_usd_clp, r.basis = 'estimated'
  from alloc a join public.receipts r on r.id = a.receipt_id
  union all
  select t.user_id, t.paid_on, 'impuesto', -1,
         null, null, 'tax_payments', t.id,
         t.amount, t.currency, null, t.fx_usd_clp, false
  from public.tax_payments t
  where t.deleted_at is null
)
select
  user_id, flow_date, flow_type, direction, firm_id, account_id, source_table, source_id,
  amount, currency, is_estimated,
  case currency
    when 'USD' then amount
    when 'CLP' then amount / fx_usd_clp
    else amount * coalesce(usd_rate, 1)
  end as amount_usd,
  case currency
    when 'CLP' then amount
    when 'USD' then amount * fx_usd_clp
    else amount * coalesce(usd_rate, 1) * fx_usd_clp
  end as amount_clp
from base;

grant usage on schema app to authenticated;
grant execute on function app.payout_estimated_net(public.payouts) to authenticated;
grant select on public.cash_flows to authenticated;
