-- Pruebas de la base de datos. Usa el ejemplo del plan (§4.2) y verifica que la vista
-- cash_flows produzca los mismos números que el motor de cálculo en TypeScript.
\set ON_ERROR_STOP on
\set QUIET on

-- Primer usuario del sistema: entra sin invitación y queda como administrador
insert into auth.users values ('11111111-1111-1111-1111-111111111111', 'basti@example.com');
-- Los demás, solo con invitación (MAYÚSCULAS a propósito: el correo no distingue mayúsculas)
insert into public.invitations (email, invited_by) values ('Otro@Example.com', '11111111-1111-1111-1111-111111111111');
insert into auth.users values ('22222222-2222-2222-2222-222222222222', 'otro@example.com');

-- Siembra de empresas (dos veces: debe ser idempotente)
select app.seed_default_firms('11111111-1111-1111-1111-111111111111');
select app.seed_default_firms('11111111-1111-1111-1111-111111111111');

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

-- Empresas sembradas
select pg_temp.assert((select count(*) from firms where name not in ('A','B')) = 11, 'siembra: 11 empresas, sin duplicar');
select pg_temp.assert((select count(*) from firms where is_configured and name not in ('A','B')) = 4, 'siembra: 4 configuradas, 7 de catálogo');
select pg_temp.assert((select split_tier_threshold = 25000 and split_tier_pct_before = 100 and default_trader_share_pct = 90
                       from firms where name = 'Apex Trader Funding'), 'Apex: 100 % hasta 25.000, luego 90 %');
select pg_temp.assert((select default_transfer_fee = 25 and not transfer_fee_is_estimate from firms where name = 'Lucid Trading'),
                      'Lucid: comisión 25 confirmada');
select pg_temp.must_fail($q$update firms set split_tier_threshold = 1000 where name = 'Topstep'$q$, 'tramo incompleto (falta %)');
select pg_temp.must_fail($q$select app.seed_default_firms('22222222-2222-2222-2222-222222222222')$q$,
                         'usuario no puede sembrar empresas de otro');
update payouts set trader_share_pct = 93.333333 where id = pg_temp.id('pay_a2');
select pg_temp.assert((select trader_share_pct = 93.333333 from payouts where id = pg_temp.id('pay_a2')), '% mezclado con 6 decimales');

-- Aprobar evaluación: TEST-1234 → PRO001 vinculada, en una transacción
insert into accounts (firm_id, label, phase, opened_on) values (pg_temp.id('firm_A'), 'TEST-1234', 'evaluacion', '2026-10-01');
insert into ids select 'eval', id from accounts where label = 'TEST-1234';
insert into ids select 'funded', approve_evaluation(pg_temp.id('eval'), 'PRO001', 'LFF050-X-PRO001', '2026-10-10');
select pg_temp.assert((select status = 'aprobada' and closed_on = '2026-10-10' from accounts where id = pg_temp.id('eval')),
                      'evaluación queda aprobada con fecha');
select pg_temp.assert((select phase = 'financiada' and status = 'activa' and origin_account_id = pg_temp.id('eval')
                              and opened_on = '2026-10-10' and firm_id = pg_temp.id('firm_A')
                       from accounts where id = pg_temp.id('funded')), 'financiada creada y vinculada');
select pg_temp.must_fail(format($q$select approve_evaluation(%L, 'PRO002', null, '2026-10-11')$q$, pg_temp.id('eval')),
                         'aprobar dos veces la misma evaluación');
select pg_temp.must_fail(format($q$select approve_evaluation(%L, 'X', null, '2026-10-11')$q$, pg_temp.id('acc_a1')),
                         'aprobar una cuenta que no es evaluación');
insert into accounts (firm_id, label, phase, opened_on) values (pg_temp.id('firm_A'), 'TEST-9', 'evaluacion', '2026-10-05');
select pg_temp.must_fail(format($q$select approve_evaluation(%L, 'PRO009', null, '2026-10-01')$q$,
                         (select id from accounts where label = 'TEST-9')), 'aprobación anterior a la apertura');

-- save_payout: payout pagado con recibo estimado, luego corregido con el real
insert into ids select 'sp1', save_payout(null, pg_temp.id('firm_A'), pg_temp.id('acc_a2'), 'paid', '2026-10-20', '2026-10-20',
  2000, 90, 0, 'USD', null, 'estimated', 1775, 'USD', '2026-10-20', null, 950, 'dolar_observado', 25, null);
select pg_temp.assert((select sum(amount_usd) from cash_flows where flow_type = 'payout_recibido' and source_id in
  (select receipt_id from receipt_allocations where payout_id = pg_temp.id('sp1'))) = 1775, 'payout estimado: recibido 1.775');
select pg_temp.assert((select bool_and(is_estimated) from cash_flows where source_id in
  (select receipt_id from receipt_allocations where payout_id = pg_temp.id('sp1'))), 'marcado como estimado');
select save_payout(pg_temp.id('sp1'), pg_temp.id('firm_A'), pg_temp.id('acc_a2'), 'paid', '2026-10-20', '2026-10-21',
  2000, 90, 0, 'USD', 'corregido', 'actual', 1780, 'USDT', '2026-10-21', 1, 950, 'manual', 0, '0xsp1');
select pg_temp.assert((select count(*) from cash_flows c join receipt_allocations a on a.receipt_id = c.source_id
                       where a.payout_id = pg_temp.id('sp1')) = 1, 'al editar se reemplaza el recibo (no se duplica)');
select pg_temp.assert((select sum(c.amount_usd) from cash_flows c join receipt_allocations a on a.receipt_id = c.source_id
                       where a.payout_id = pg_temp.id('sp1') and not c.is_estimated) = 1780, 'ahora recibido real 1.780');
select pg_temp.must_fail(format($q$select save_payout(null, %L, %L, 'requested', '2026-10-22', null, 1000, 90, 0, 'USD', null,
  'estimated', 875, 'USD', null, null, 950, 'manual', 25, null)$q$, pg_temp.id('firm_A'), pg_temp.id('acc_a2')),
  'recibo en payout no pagado');
select pg_temp.must_fail(format($q$select save_payout(null, %L, %L, 'paid', '2026-10-22', null, 1000, 90, 0, 'USD', null,
  'none', null, null, null, null, null, null, null, null)$q$, pg_temp.id('firm_B'), pg_temp.id('acc_a2')),
  'cuenta de otra empresa');
select pg_temp.assert((select delete_payouts(array[pg_temp.id('sp1')])) = 1, 'eliminar payout');
select pg_temp.assert((select count(*) from cash_flows c join receipt_allocations a on a.receipt_id = c.source_id
                       where a.payout_id = pg_temp.id('sp1')) = 0, 'su recibo deja de contar');
select pg_temp.assert((select restore_payouts(array[pg_temp.id('sp1')])) = 1, 'deshacer eliminación de payout');
select pg_temp.assert((select sum(c.amount_usd) from cash_flows c join receipt_allocations a on a.receipt_id = c.source_id
                       where a.payout_id = pg_temp.id('sp1')) = 1780, 'vuelve el recibo real (no el estimado viejo)');
select delete_payouts(array[pg_temp.id('sp1')]);

-- Eliminar y deshacer
select pg_temp.must_fail(format($q$select delete_accounts(array[%L]::uuid[])$q$, pg_temp.id('acc_a1')),
                         'eliminar cuenta con payouts');
select pg_temp.assert((select delete_accounts(array[pg_temp.id('eval')])) = 1, 'eliminar evaluación');
select pg_temp.assert((select origin_account_id is null and deleted_at is null from accounts where id = pg_temp.id('funded')),
                      'la financiada queda sin vínculo y no se elimina');
select pg_temp.assert((select restore_accounts(array[pg_temp.id('eval')])) = 1, 'deshacer eliminación');
select pg_temp.assert((select deleted_at is null from accounts where id = pg_temp.id('eval')), 'la cuenta vuelve a estar visible');
select pg_temp.assert((select delete_accounts(array[pg_temp.id('eval'), pg_temp.id('funded')])) = 2, 'eliminar varias a la vez');

-- Registro por invitación
create or replace function pg_temp.must_fail_su(sql text, msg text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'ok  rechaza: % (%)', msg, sqlerrm; return; end;
  raise exception 'FALLÓ: debía rechazar: %', msg;
end $$;
reset role;
select pg_temp.assert((select count(*) from app_admins) = 1
                      and exists (select 1 from app_admins where user_id = '11111111-1111-1111-1111-111111111111'),
                      'el primer usuario es el único administrador');
select pg_temp.assert((select used_by = '22222222-2222-2222-2222-222222222222' from invitations where lower(email) = 'otro@example.com'),
                      'la invitación queda usada por el nuevo usuario');
select pg_temp.assert((select count(*) from firms where user_id = '22222222-2222-2222-2222-222222222222') = 11,
                      'el nuevo usuario recibe sus 11 empresas iniciales');
select pg_temp.must_fail_su($q$insert into auth.users values ('33333333-3333-3333-3333-333333333333', 'intruso@example.com')$q$,
                            'registrarse sin invitación');
insert into invitations (email, expires_at) values ('vencida@example.com', now() - interval '1 day');
select pg_temp.must_fail_su($q$insert into auth.users values ('44444444-4444-4444-4444-444444444444', 'vencida@example.com')$q$,
                            'invitación vencida');
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select pg_temp.assert((select is_admin()), 'is_admin() verdadero para el administrador');
insert into invitations (email) values ('amiga@example.com');
select pg_temp.assert((select count(*) from invitations) >= 3, 'el administrador ve y crea invitaciones');
select pg_temp.must_fail($q$insert into invitations (email) values ('amiga@example.com')$q$, 'invitación pendiente duplicada');
select pg_temp.must_fail($q$update invitations set used_at = now()$q$, 'marcar invitación como usada a mano');

-- Dispositivos recordados
insert into trusted_devices (token_hash, label) values (repeat('a', 64), 'iPhone');
insert into trusted_devices (token_hash, label, expires_at) values (repeat('b', 64), 'Viejo', now() - interval '1 minute');
select pg_temp.assert((select check_trusted_device(repeat('a', 64))), 'dispositivo recordado vigente');
select pg_temp.assert((select last_used_at is not null from trusted_devices where token_hash = repeat('a', 64)), 'registra último uso');
select pg_temp.assert(not (select check_trusted_device(repeat('b', 64))), 'dispositivo vencido no sirve');
select pg_temp.assert(not (select check_trusted_device(repeat('c', 64))), 'token desconocido no sirve');
select pg_temp.must_fail($q$insert into trusted_devices (token_hash, expires_at) values (repeat('d', 64), now() + interval '90 days')$q$,
                         'recordar más de 30 días');
select pg_temp.must_fail($q$update trusted_devices set expires_at = now() + interval '1 year'$q$, 'extender un dispositivo a mano');

-- Auditoría y aislamiento
update expenses set description = 'editado' where external_ref = 'A-1';
select pg_temp.assert(
  (select count(*) from audit_log where table_name = 'expenses' and action = 'UPDATE') = 1
  and (select old_values ->> 'description' is null and new_values ->> 'description' = 'editado'
         from audit_log where table_name = 'expenses' and action = 'UPDATE'),
  'auditoría guarda antes y después');
select pg_temp.assert((select count(*) from account_status_history) = 7, 'historial de estado de cuentas');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select pg_temp.assert((select count(*) from expenses) = 0 and (select count(*) from cash_flows) = 0
                      and (select count(*) from audit_log where user_id <> auth.uid()) = 0
                      and (select count(*) from firms) = 11, 'otro usuario solo ve sus propios datos (RLS)');
select pg_temp.assert(not (select is_admin()) and (select count(*) from invitations) = 0, 'no administrador no ve invitaciones');
select pg_temp.assert(not (select check_trusted_device(repeat('a', 64))) and (select count(*) from trusted_devices) = 0,
                      'el dispositivo recordado de otro usuario no sirve ni se ve');
select pg_temp.must_fail($q$insert into invitations (email) values ('x@example.com')$q$, 'no administrador no puede invitar');
select pg_temp.must_fail(format($q$insert into firms (user_id, name) values (%L, 'intrusa')$q$,
  '11111111-1111-1111-1111-111111111111'), 'escribir filas de otro usuario');

reset role;
set role anon;
select pg_temp.must_fail($q$select * from expenses$q$, 'acceso anónimo');
reset role;
\echo TODAS_LAS_PRUEBAS_DE_BD_OK
