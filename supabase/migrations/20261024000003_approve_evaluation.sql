-- =============================================================================
-- Aprobar una evaluación: en las empresas que usas (Lucid, Topstep…) la cuenta
-- financiada es una cuenta NUEVA (ej. TEST-1234 → PRO001). Esta función, en una sola
-- transacción, marca la evaluación como aprobada y crea la financiada vinculada.
-- security invoker: corre con los permisos del usuario, así que RLS aplica igual.
-- =============================================================================
create or replace function public.approve_evaluation(
  p_evaluation_id uuid,
  p_label text,
  p_external_id text,
  p_approved_on date
) returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  ev public.accounts;
  new_id uuid;
begin
  select * into ev from public.accounts where id = p_evaluation_id and deleted_at is null for update;
  if not found then
    raise exception 'Evaluación no encontrada' using errcode = 'no_data_found';
  end if;
  if ev.phase <> 'evaluacion' then
    raise exception 'La cuenta % no está en fase de evaluación', ev.label using errcode = 'check_violation';
  end if;
  if ev.status <> 'activa' then
    raise exception 'La evaluación % ya está %', ev.label, ev.status using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.accounts where origin_account_id = ev.id and deleted_at is null) then
    raise exception 'La evaluación % ya tiene una cuenta financiada vinculada', ev.label using errcode = 'check_violation';
  end if;
  if ev.opened_on is not null and p_approved_on < ev.opened_on then
    raise exception 'La aprobación no puede ser anterior a la apertura de la evaluación' using errcode = 'check_violation';
  end if;

  update public.accounts set status = 'aprobada', closed_on = p_approved_on where id = ev.id;

  insert into public.accounts (user_id, firm_id, label, external_id, plan_name, nominal_size, nominal_currency,
                               phase, status, origin_account_id, platform_id, strategy_id, opened_on)
  values (ev.user_id, ev.firm_id, trim(p_label), nullif(trim(p_external_id), ''), ev.plan_name, ev.nominal_size,
          ev.nominal_currency, 'financiada', 'activa', ev.id, ev.platform_id, ev.strategy_id, p_approved_on)
  returning id into new_id;

  return new_id;
end $$;

revoke all on function public.approve_evaluation(uuid, text, text, date) from public, anon;
grant execute on function public.approve_evaluation(uuid, text, text, date) to authenticated;

-- Una evaluación solo puede originar una cuenta financiada.
create unique index accounts_one_funded_per_eval on public.accounts (origin_account_id)
  where origin_account_id is not null and deleted_at is null;
