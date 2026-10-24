-- =============================================================================
-- Varios usuarios, cada uno con sus propios datos (RLS ya aísla cada fila por user_id).
-- El registro es SOLO por invitación: un trigger en auth.users rechaza cualquier alta
-- cuyo correo no tenga una invitación vigente, aunque alguien llame directo a la API
-- de Supabase. El primer usuario del sistema queda como administrador.
-- Al crearse un usuario se le cargan las empresas iniciales.
-- =============================================================================

create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null
);
-- Una sola invitación pendiente por correo
create unique index invitations_pending_uq on public.invitations (lower(email)) where used_at is null;

-- Los administradores actuales (hoy: el único usuario existente)
insert into public.app_admins (user_id) select id from auth.users on conflict do nothing;

create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid())
$$;

-- Expuesta a la app para mostrar u ocultar la sección Invitaciones
create or replace function public.is_admin() returns boolean
language sql stable security invoker set search_path = public, pg_temp as $$
  select app.is_admin()
$$;

-- Antes de crear un usuario: debe estar invitado (o ser el primero del sistema)
create or replace function app.check_invitation() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from auth.users) then
    return new; -- primer usuario: se convierte en administrador (ver after_user_created)
  end if;
  if not exists (
    select 1 from public.invitations
    where lower(email) = lower(new.email) and used_at is null and expires_at > now()
  ) then
    raise exception 'Este correo no tiene una invitación vigente' using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- Después de crear un usuario: empresas iniciales y, si es el primero, administrador
create or replace function app.after_user_created() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.app_admins) then
    insert into public.app_admins (user_id) values (new.id);
  end if;
  -- La invitación se marca como usada aquí (el usuario ya existe para la referencia)
  update public.invitations set used_at = now(), used_by = new.id
  where id = (
    select id from public.invitations
    where lower(email) = lower(new.email) and used_at is null and expires_at > now()
    order by created_at desc limit 1
  );
  perform app.seed_default_firms(new.id);
  return new;
end $$;

create trigger check_invitation before insert on auth.users
  for each row execute function app.check_invitation();
create trigger after_user_created after insert on auth.users
  for each row execute function app.after_user_created();

-- Seguridad: solo administradores ven y crean invitaciones; nadie edita app_admins desde la API
alter table public.invitations enable row level security;
alter table public.app_admins enable row level security;
create policy admin_select on public.invitations for select to authenticated using (app.is_admin());
create policy admin_insert on public.invitations for insert to authenticated
  with check (app.is_admin() and invited_by = auth.uid() and used_at is null);
create policy admin_delete on public.invitations for delete to authenticated using (app.is_admin() and used_at is null);
alter table public.invitations alter column invited_by set default auth.uid();
revoke update, truncate on public.invitations from anon, authenticated;
revoke all on public.app_admins from anon, authenticated;

revoke all on function app.check_invitation() from public, anon, authenticated;
revoke all on function app.after_user_created() from public, anon, authenticated;
grant execute on function app.is_admin() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- Hora del servidor (para comparar vencimientos sin depender del reloj de la app)
create or replace function public.db_now() returns timestamptz language sql stable as $$ select now() $$;
grant execute on function public.db_now() to authenticated;
