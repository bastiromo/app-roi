-- Pruebas de la base de datos. Usa el ejemplo del plan (§4.2) y verifica que la vista
-- cash_flows produzca los mismos números que el motor de cálculo en TypeScript.
\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users values
  ('11111111-1111-1111-1111-111111111111', 'basti@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'otro@example.com');

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

create temp table ids (k text primary key, v uuid);
create or replace function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1 $$;

with f as (insert into firms (name, default_trader_share_pct, default_transfer_fee)
           values ('A', 90, 0), ('B', 80, 0) returning id, name)
insert into ids select 'firm_' || name, id from f;

with a as (insert into accounts (firm_id, label, phase) values
  (pg_temp.id('firm_A'), 'a1', 'financiada'), (pg_temp.id('firm_A'), 'a2', 'financiada'),
  (pg_temp.id('firm_B'), 'b1', 'financiada') returning id, label)
insert into ids select 'acc_' || label, id from a;

-- Costos (dólar a 900)
insert into expenses (occurred_on, firm_id, category, amount, currency, fx_usd_clp, external_ref) values
  ('2026-09-01', pg_temp.id('firm_A'), 'evaluacion', 150, 'USD', 900, 'A-1'),
  ('2026-09-01', pg_temp.id('firm_A'), 'evaluacion', 150, 'USD', 900, 'A-2'),
  ('2026-09-01', pg_temp.id('firm_A'), 'evaluacion', 150, 'USD', 900, 'A-3'),
  ('2026-09-01', pg_temp.id('firm_A'), 'activacion', 130, 'USD', 900, null),
  ('2026-09-01', pg_temp.id('firm_A'), 'reset', 80, 'USD', 900, null),
  ('2026-09-01', pg_temp.id('firm_A'), 'reset', 80, 'USD', 900, null),
  ('2026-09-01', pg_temp.id('firm_A'), 'datos_mercado', 40, 'USD', 900, null),
  ('2026-09-01', pg_temp.id('firm_B'), 'evaluacion', 99, 'USD', 900, 'B-1'),
  ('2026-09-01', pg_temp.id('firm_B'), 'evaluacion', 99, 'USD', 900, 'B-2'),
  ('2026-09-01', null, 'plataforma', 120, 'USD', 900, null);
insert into expenses (occurred_on, firm_id, category, amount, currency, fx_usd_clp, status, external_ref)
  values ('2026-09-02', pg_temp.id('firm_A'), 'evaluacion', 150, 'USD', 900, 'failed', 'A-FAIL');
insert into expenses (kind, refund_of_id, occurred_on, firm_id, category, amount, currency, fx_usd_clp)
  select 'refund', id, '2026-10-01', firm_id, 'evaluacion', 99, 'USD', 900 from expenses where external_ref = 'B-1';

-- Payouts
with p as (insert into payouts (firm_id, account_id, status, requested_on, requested_amount, trader_share_pct) values
  (pg_temp.id('firm_A'), pg_temp.id('acc_a1'), 'requested', '2026-10-01', 2000, 90),
  (pg_temp.id('firm_B'), pg_temp.id('acc_b1'), 'requested', '2026-10-01', 1000, 80),
  (pg_temp.id('firm_A'), pg_temp.id('acc_a2'), 'requested', '2026-10-10', 1000, 90) returning id, account_id)
insert into ids select 'pay_' || (select label from accounts where id = p.account_id), id from p;
update payouts set status = 'paid', paid_on = '2026-10-02' where id in (pg_temp.id('pay_a1'), pg_temp.id('pay_b1'));

-- Recibos (dólar a 950)
with r as (insert into receipts (received_on, amount, currency, fx_usd_clp, tx_hash) values
  ('2026-10-03', 1780, 'USDT', 950, '0xaaa'), ('2026-10-03', 785, 'USDT', 950, '0xbbb') returning id, tx_hash)
insert into ids select 'rec_' || tx_hash, id from r;
insert into receipt_allocations (receipt_id, payout_id) values
  (pg_temp.id('rec_0xaaa'), pg_temp.id('pay_a1')), (pg_temp.id('rec_0xbbb'), pg_temp.id('pay_b1'));

-- Impuesto inventado SOLO para el ejemplo
insert into tax_payments (tax_year, paid_on, amount, currency, fx_usd_clp) values (2027, '2027-04-30', 250, 'USD', 950);

-- ---------------------------------------------------------------------------
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'FALLÓ: %', msg; end if;
  raise notice 'ok  %', msg;
end $$;

create temp view s as
select
  -sum(amount_usd * direction) filter (where flow_type in ('costo','reembolso')) as c_usd,
  sum(amount_usd) filter (where flow_type = 'payout_recibido') as r_usd,
  sum(amount_usd) filter (where flow_type = 'impuesto') as t_usd,
  -sum(amount_clp * direction) filter (where flow_type in ('costo','reembolso')) as c_clp,
  sum(amount_clp) filter (where flow_type = 'payout_recibido') as r_clp
from cash_flows;

select pg_temp.assert((select c_usd from s) = 999, 'C = 999 USD (reembolso restado, fallido excluido)');
select pg_temp.assert((select r_usd from s) = 2565, 'R = 2.565 USD (payout solicitado no cuenta)');
select pg_temp.assert(round((select (r_usd - c_usd) / c_usd * 100 from s), 2) = 156.76, 'ROI USD 156,76 %');
select pg_temp.assert(round((select (r_usd - c_usd - t_usd) / c_usd * 100 from s), 2) = 131.73, 'ROI neto 131,73 %');
select pg_temp.assert(round((select (r_clp - c_clp) / c_clp * 100 from s), 2) = 171.02, 'ROI CLP 171,02 %');
select pg_temp.assert(
  (select round(sum(amount_usd * direction) / -sum(amount_usd * direction) filter (where direction < 0) * 100, 2)
     from cash_flows where firm_id = pg_temp.id('firm_A') and flow_type <> 'impuesto') = 128.21,
  'ROI empresa A 128,21 %');

-- Recibo que cubre dos payouts (caso Lucid 22-10): reparto proporcional exacto
with p as (insert into payouts (firm_id, account_id, status, requested_on, requested_amount, trader_share_pct) values
  (pg_temp.id('firm_A'), pg_temp.id('acc_a1'), 'requested', '2026-10-22', 2000, 90),
  (pg_temp.id('firm_A'), pg_temp.id('acc_a2'), 'requested', '2026-10-22', 2000, 90) returning id)
insert into ids select 'lucid_' || row_number() over (), id from p;
update payouts set status = 'paid' where id in (pg_temp.id('lucid_1'), pg_temp.id('lucid_2'));
with r as (insert into receipts (received_on, amount, currency, fx_usd_clp) values ('2026-10-22', 3577, 'USDT', 950) returning id)
insert into ids select 'rec_3577', id from r;
insert into receipt_allocations (receipt_id, payout_id) values
  (pg_temp.id('rec_3577'), pg_temp.id('lucid_1')), (pg_temp.id('rec_3577'), pg_temp.id('lucid_2'));
select pg_temp.assert(
  (select array_agg(round(amount_usd, 2) order by amount_usd) from cash_flows where source_id = pg_temp.id('rec_3577'))
    = array[1788.50, 1788.50]::numeric[], 'Recibo 3.577 repartido 1.788,50 + 1.788,50');

-- ---------------------------------------------------------------------------
-- Reglas que deben FALLAR
create or replace function pg_temp.must_fail(sql text, msg text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'ok  rechaza: % (%)', msg, sqlerrm;
    return;
  end;
  raise exception 'FALLÓ: debía rechazar: %', msg;
end $$;

select pg_temp.must_fail(format(
  $q$insert into expenses (occurred_on, firm_id, category, amount, currency, fx_usd_clp, external_ref)
     values ('2026-09-03', %L, 'evaluacion', 150, 'USD', 900, 'A-1')$q$, pg_temp.id('firm_A')),
  'n.º de orden duplicado');
select pg_temp.must_fail($q$insert into receipts (received_on, amount, currency, fx_usd_clp, tx_hash)
                            values ('2026-10-05', 10, 'USDT', 950, '0xaaa')$q$, 'hash de transacción duplicado');
select pg_temp.must_fail(format($q$insert into receipt_allocations (receipt_id, payout_id) values (%L, %L)$q$,
  pg_temp.id('rec_0xaaa'), pg_temp.id('pay_a2')), 'dinero recibido en payout no pagado');
select pg_temp.must_fail(format($q$update payouts set status = 'requested' where id = %L$q$, pg_temp.id('pay_a1')),
  'transición pagado → solicitado');
select pg_temp.must_fail(format($q$update payouts set status = 'paid' where id = %L$q$, pg_temp.id('pay_a2'))
  || '; ' || format($q$update payouts set status = 'rejected' where id = %L$q$, pg_temp.id('pay_a2')),
  'transición pagado → rechazado');
select pg_temp.must_fail($q$delete from expenses$q$, 'borrado físico de gastos');
select pg_temp.must_fail($q$update audit_log set action = 'INSERT'$q$, 'modificar la auditoría');
select pg_temp.must_fail($q$insert into payment_methods (label) values ('Visa 4111111111111111')$q$,
  'guardar número completo de tarjeta');
select pg_temp.must_fail(format(
  $q$insert into expenses (occurred_on, firm_id, category, amount, currency, fx_usd_clp) values ('2026-09-01', %L, 'otros', -5, 'USD', 900)$q$,
  pg_temp.id('firm_A')), 'monto negativo');

-- Auditoría y aislamiento
update expenses set description = 'editado' where external_ref = 'A-1';
select pg_temp.assert(
  (select count(*) from audit_log where table_name = 'expenses' and action = 'UPDATE') = 1
  and (select old_values ->> 'description' is null and new_values ->> 'description' = 'editado'
         from audit_log where table_name = 'expenses' and action = 'UPDATE'),
  'auditoría guarda antes y después');
select pg_temp.assert((select count(*) from account_status_history) = 3, 'historial de estado de cuentas');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select pg_temp.assert((select count(*) from expenses) = 0 and (select count(*) from cash_flows) = 0
                      and (select count(*) from audit_log) = 0, 'otro usuario no ve nada (RLS)');
select pg_temp.must_fail(format($q$insert into firms (user_id, name) values (%L, 'intrusa')$q$,
  '11111111-1111-1111-1111-111111111111'), 'escribir filas de otro usuario');

reset role;
set role anon;
select pg_temp.must_fail($q$select * from expenses$q$, 'acceso anónimo');
reset role;
\echo TODAS_LAS_PRUEBAS_DE_BD_OK
