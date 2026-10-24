-- =============================================================================
-- Dispositivos recordados: tras verificar el código 2FA, el usuario puede recordar
-- el dispositivo por 30 días. El navegador guarda un token aleatorio (cookie httpOnly);
-- aquí solo se guarda su hash SHA-256, nunca el token.
-- =============================================================================
create table public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label text not null default 'Dispositivo',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  last_used_at timestamptz,
  check (expires_at <= created_at + interval '31 days')
);
create index trusted_devices_user_idx on public.trusted_devices (user_id);

alter table public.trusted_devices enable row level security;
create policy own_select on public.trusted_devices for select to authenticated using (user_id = auth.uid());
create policy own_insert on public.trusted_devices for insert to authenticated with check (user_id = auth.uid());
create policy own_delete on public.trusted_devices for delete to authenticated using (user_id = auth.uid());
revoke update, truncate on public.trusted_devices from anon, authenticated;

-- ¿Este token corresponde a un dispositivo vigente del usuario actual? (marca último uso)
create or replace function public.check_trusted_device(p_hash text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare found_id uuid;
begin
  if auth.uid() is null then return false; end if;
  select id into found_id from public.trusted_devices
  where token_hash = p_hash and user_id = auth.uid() and expires_at > now();
  if found_id is null then return false; end if;
  update public.trusted_devices set last_used_at = now() where id = found_id;
  return true;
end $$;

revoke all on function public.check_trusted_device(text) from public, anon;
grant execute on function public.check_trusted_device(text) to authenticated;
