-- PostgREST on_conflict=leadgen_id cannot infer the old partial index.
-- Default UNIQUE semantics still allow multiple NULL IDs for manual leads.
-- Build the replacement before removing the old index; migration is transactional.
create unique index if not exists marketing_leads_leadgen_id_upsert_uidx
  on public.marketing_leads (leadgen_id);
drop index if exists public.marketing_leads_leadgen_id_uidx;
