-- =============================================================================
-- Etapa 4: guardar un payout y su dinero recibido en una sola transacción.
--   p_receipt_mode:
--     'none'      → sin recibo (si está pagado, queda "por cobrar")
--     'estimated' → recibo calculado (retiro × % − comisiones), rotulado como estimado
--     'actual'    → monto real que llegó (billetera / banco)
-- Al editar, los recibos que pertenecen solo a este payout se reemplazan.
-- security invoker: RLS y los triggers de transición aplican igual.
-- =============================================================================
create or replace function public.save_payout(
  p_id uuid,
  p_firm_id uuid,
  p_account_id uuid,
  p_status public.payout_status,
  p_requested_on date,
  p_paid_on date,
  p_requested_amount numeric,
  p_trader_share_pct numeric,
  p_firm_fee_amount numeric,
  p_currency public.currency_code,
  p_notes text,
  p_receipt_mode text,
  p_received_amount numeric,
  p_received_currency public.currency_code,
  p_received_on date,
  p_usd_rate numeric,
  p_fx_usd_clp numeric,
  p_fx_source public.fx_source,
  p_processor_fee numeric,
  p_tx_hash text
) returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  pid uuid;
  rid uuid;
begin
  if p_receipt_mode not in ('none', 'estimated', 'actual') then
    raise exception 'Modo de recibo inválido' using errcode = 'check_violation';
  end if;
  if p_receipt_mode <> 'none' and p_status <> 'paid' then
    raise exception 'Solo un payout pagado puede tener dinero recibido' using errcode = 'check_violation';
  end if;

  if p_id is null then
    insert into public.payouts (firm_id, account_id, status, requested_on, paid_on, requested_amount, approved_amount,
                                trader_share_pct, firm_fee_amount, currency, notes, source)
    values (p_firm_id, p_account_id, p_status, p_requested_on, p_paid_on, p_requested_amount, p_requested_amount,
            p_trader_share_pct, coalesce(p_firm_fee_amount, 0), p_currency, p_notes, 'manual')
    returning id into pid;
  else
    -- Recibos exclusivos de este payout: se reemplazan
    update public.receipts r set deleted_at = now()
    where r.deleted_at is null
      and exists (select 1 from public.receipt_allocations a where a.receipt_id = r.id and a.payout_id = p_id)
      and not exists (select 1 from public.receipt_allocations a where a.receipt_id = r.id and a.payout_id <> p_id);
    delete from public.receipt_allocations a
    where a.payout_id = p_id
      and not exists (select 1 from public.receipt_allocations b where b.receipt_id = a.receipt_id and b.payout_id <> p_id);

    update public.payouts set
      firm_id = p_firm_id, account_id = p_account_id, status = p_status, requested_on = p_requested_on,
      paid_on = p_paid_on, requested_amount = p_requested_amount, approved_amount = p_requested_amount,
      trader_share_pct = p_trader_share_pct, firm_fee_amount = coalesce(p_firm_fee_amount, 0),
      currency = p_currency, notes = p_notes
    where id = p_id and deleted_at is null
    returning id into pid;
    if pid is null then
      raise exception 'Payout no encontrado' using errcode = 'no_data_found';
    end if;
  end if;

  if p_receipt_mode <> 'none' then
    insert into public.receipts (received_on, basis, amount, currency, usd_rate, fx_usd_clp, fx_source, processor_fee, tx_hash, source)
    values (coalesce(p_received_on, p_paid_on, p_requested_on),
            case p_receipt_mode when 'estimated' then 'estimated'::public.receipt_basis else 'actual'::public.receipt_basis end,
            p_received_amount, p_received_currency, p_usd_rate, p_fx_usd_clp, p_fx_source,
            coalesce(p_processor_fee, 0), nullif(trim(p_tx_hash), ''), 'manual')
    returning id into rid;
    insert into public.receipt_allocations (receipt_id, payout_id) values (rid, pid);
  end if;

  return pid;
end $$;

-- Eliminar / restaurar payouts (borrado lógico) junto con sus recibos exclusivos.
create or replace function public.delete_payouts(p_ids uuid[]) returns int
language plpgsql security invoker set search_path = public, pg_temp as $$
declare n int;
begin
  update public.receipts r set deleted_at = now()
  where r.deleted_at is null
    and exists (select 1 from public.receipt_allocations a where a.receipt_id = r.id and a.payout_id = any(p_ids))
    and not exists (select 1 from public.receipt_allocations a where a.receipt_id = r.id and not (a.payout_id = any(p_ids)));
  update public.payouts set deleted_at = now() where id = any(p_ids) and deleted_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.restore_payouts(p_ids uuid[]) returns int
language plpgsql security invoker set search_path = public, pg_temp as $$
declare n int;
begin
  update public.payouts set deleted_at = null where id = any(p_ids) and deleted_at is not null;
  get diagnostics n = row_count;
  -- Restaura el recibo más reciente de cada payout (el que se eliminó junto con él)
  update public.receipts r set deleted_at = null
  where r.id in (
    select distinct on (a.payout_id) a.receipt_id
    from public.receipt_allocations a join public.receipts x on x.id = a.receipt_id
    where a.payout_id = any(p_ids) and x.deleted_at is not null
    order by a.payout_id, x.deleted_at desc
  );
  return n;
end $$;

-- receipts guarda de dónde vino el dato
alter table public.receipts alter column source set default 'manual';

revoke all on function public.save_payout(uuid, uuid, uuid, public.payout_status, date, date, numeric, numeric, numeric,
  public.currency_code, text, text, numeric, public.currency_code, date, numeric, numeric, public.fx_source, numeric, text) from public, anon;
grant execute on function public.save_payout(uuid, uuid, uuid, public.payout_status, date, date, numeric, numeric, numeric,
  public.currency_code, text, text, numeric, public.currency_code, date, numeric, numeric, public.fx_source, numeric, text) to authenticated;
revoke all on function public.delete_payouts(uuid[]) from public, anon;
revoke all on function public.restore_payouts(uuid[]) from public, anon;
grant execute on function public.delete_payouts(uuid[]) to authenticated;
grant execute on function public.restore_payouts(uuid[]) to authenticated;

-- cash_flows: agrega payout_id (al final, para no romper la vista existente)
create or replace view public.cash_flows with (security_invoker = true) as
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
         e.amount, e.currency, e.usd_rate, e.fx_usd_clp, false as is_estimated, null::uuid as payout_id
  from public.expenses e
  where e.status = 'paid' and e.deleted_at is null
  union all
  select r.user_id, r.received_on, 'payout_recibido', 1,
         a.firm_id, a.account_id, 'receipts', r.id,
         a.share, r.currency, r.usd_rate, r.fx_usd_clp, r.basis = 'estimated', a.payout_id
  from alloc a join public.receipts r on r.id = a.receipt_id
  union all
  select t.user_id, t.paid_on, 'impuesto', -1,
         null, null, 'tax_payments', t.id,
         t.amount, t.currency, null, t.fx_usd_clp, false, null::uuid
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
  end as amount_clp,
  payout_id
from base;

