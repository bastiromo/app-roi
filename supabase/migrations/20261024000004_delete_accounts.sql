-- =============================================================================
-- Eliminar cuentas (borrado lógico) y deshacer.
-- No se permite eliminar una cuenta con gastos o payouts registrados: ese dinero
-- dejaría de estar asociado. Si una evaluación eliminada originó una financiada,
-- la financiada queda sin vínculo (no se elimina).
-- security invoker: RLS aplica; cada usuario solo afecta sus cuentas.
-- =============================================================================
create or replace function public.delete_accounts(p_ids uuid[]) returns int
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  blocked text;
  n int;
begin
  select string_agg(a.label, ', ' order by a.label) into blocked
  from public.accounts a
  where a.id = any(p_ids) and a.deleted_at is null
    and (exists (select 1 from public.expenses e where e.account_id = a.id and e.deleted_at is null)
      or exists (select 1 from public.payouts p where p.account_id = a.id and p.deleted_at is null));
  if blocked is not null then
    raise exception 'No se puede eliminar % porque tiene gastos o payouts registrados. Elimina o reasigna esos registros primero.', blocked
      using errcode = 'check_violation';
  end if;

  update public.accounts set origin_account_id = null
  where origin_account_id = any(p_ids) and deleted_at is null and not (id = any(p_ids));

  update public.accounts set deleted_at = now() where id = any(p_ids) and deleted_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.restore_accounts(p_ids uuid[]) returns int
language plpgsql security invoker set search_path = public, pg_temp as $$
declare n int;
begin
  update public.accounts set deleted_at = null where id = any(p_ids) and deleted_at is not null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.delete_accounts(uuid[]) from public, anon;
revoke all on function public.restore_accounts(uuid[]) from public, anon;
grant execute on function public.delete_accounts(uuid[]) to authenticated;
grant execute on function public.restore_accounts(uuid[]) to authenticated;
