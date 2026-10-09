-- P1: stream Geo Tender target status changes to authorized request owners.
-- RLS on request_targets remains authoritative for which rows Realtime can deliver.
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'request_targets'
  ) then
    execute 'alter publication supabase_realtime add table public.request_targets';
  end if;
end
$$;
