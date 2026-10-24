-- Preparación de la base para las pruebas de API en CI (después de auth_stub + migraciones).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login password 'authenticator' noinherit;
  end if;
end $$;
grant anon, authenticated to authenticator;
insert into auth.users values ('11111111-1111-1111-1111-111111111111', 'basti@example.com');
select app.seed_default_firms('11111111-1111-1111-1111-111111111111');
