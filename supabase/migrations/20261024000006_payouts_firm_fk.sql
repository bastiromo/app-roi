-- payouts.firm_id solo estaba ligado a firms a través de accounts (FK compuesta).
-- La API (PostgREST) necesita una FK directa para incluir el nombre de la empresa en una consulta.
alter table public.payouts
  add constraint payouts_firm_id_fkey foreign key (firm_id) references public.firms (id);
