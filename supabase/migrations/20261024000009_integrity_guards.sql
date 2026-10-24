-- Defensa en profundidad (revisión externa):
-- 1) Una fila solo puede apuntar a filas del MISMO usuario. Las llaves foráneas de PostgreSQL
--    no miran RLS: sin esto, alguien que conociera el UUID de una fila ajena podría vincularla.
-- 2) Lo asignado de un recibo no puede superar su monto.

create or replace function app.check_same_owner() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  i int;
  ref uuid;
  owner uuid;
begin
  -- Nombre con prefijo «a_» para que corra antes que los demás triggers BEFORE (orden alfabético).
  -- Argumentos en pares: columna, tabla referida
  for i in 0 .. (tg_nargs / 2 - 1) loop
    execute format('select ($1).%I', tg_argv[2 * i]) into ref using new;
    if ref is not null then
      execute format('select user_id from public.%I where id = $1', tg_argv[2 * i + 1]) into owner using ref;
      if owner is distinct from new.user_id then
        raise exception 'Referencia inválida (%): no pertenece a tu cuenta', tg_argv[2 * i]
          using errcode = 'insufficient_privilege';
      end if;
    end if;
  end loop;
  return new;
end $$;
revoke all on function app.check_same_owner() from public;

create trigger a_same_owner before insert or update on public.accounts for each row execute function
  app.check_same_owner('firm_id', 'firms', 'origin_account_id', 'accounts', 'platform_id', 'platforms', 'strategy_id', 'strategies');
create trigger a_same_owner before insert or update on public.account_status_history for each row execute function
  app.check_same_owner('account_id', 'accounts');
create trigger a_same_owner before insert or update on public.account_balance_snapshots for each row execute function
  app.check_same_owner('account_id', 'accounts');
create trigger a_same_owner before insert or update on public.expenses for each row execute function
  app.check_same_owner('refund_of_id', 'expenses', 'firm_id', 'firms', 'account_id', 'accounts', 'payment_method_id', 'payment_methods');
create trigger a_same_owner before insert or update on public.payouts for each row execute function
  app.check_same_owner('firm_id', 'firms', 'account_id', 'accounts');
create trigger a_same_owner before insert or update on public.receipts for each row execute function
  app.check_same_owner('payment_method_id', 'payment_methods');
create trigger a_same_owner before insert or update on public.receipt_allocations for each row execute function
  app.check_same_owner('receipt_id', 'receipts', 'payout_id', 'payouts');
create trigger a_same_owner before insert or update on public.tax_payments for each row execute function
  app.check_same_owner('payout_id', 'payouts');

-- Lo asignado con monto explícito no puede superar el monto del recibo
create or replace function app.check_allocation_total() returns trigger
language plpgsql as $$
declare
  total numeric;
  available numeric;
  rid uuid;
begin
  -- (ramas separadas: PL/pgSQL solo evalúa new.receipt_id en la tabla de asignaciones)
  if tg_table_name = 'receipts' then
    rid := new.id;
  else
    rid := new.receipt_id;
  end if;
  select amount into available from public.receipts where id = rid;
  select coalesce(sum(amount), 0) into total from public.receipt_allocations where receipt_id = rid;
  if total > available then
    raise exception 'Lo asignado (%) supera el monto del recibo (%)', total, available
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

-- Constraint triggers diferibles: se revisan al final de la transacción, cuando ya están
-- todas las filas (permite editar el recibo y sus asignaciones juntos).
create constraint trigger allocations_within_receipt after insert or update on public.receipt_allocations
  deferrable initially deferred for each row execute function app.check_allocation_total();
create constraint trigger receipt_covers_allocations after update of amount on public.receipts
  deferrable initially deferred for each row execute function app.check_allocation_total();
