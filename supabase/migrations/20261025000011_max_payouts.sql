-- Retiros máximos por cuenta financiada (ej. 4: después de la cuarta se "quema" la cuenta).
-- Por empresa, editable; null = sin límite. Parte en 4 para todas (también las ya creadas).
alter table public.firms
  add column max_payouts_per_account smallint default 4
  check (max_payouts_per_account between 1 and 50);
update public.firms set max_payouts_per_account = 4 where max_payouts_per_account is null;
