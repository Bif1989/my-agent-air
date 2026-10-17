-- P10 closeout: keep browser roles on data-level privileges only.
-- Wallet tables were created after the original P10 least-privilege migration,
-- so remove structural privileges that were inherited from PostgreSQL defaults.
revoke truncate, references, trigger on table public.billing_settings from anon, authenticated;
revoke truncate, references, trigger on table public.billing_wallets from anon, authenticated;
revoke truncate, references, trigger on table public.billing_wallet_ledger from anon, authenticated;

-- Prevent the same regression on future public tables created by the postgres owner.
-- SELECT/INSERT/UPDATE/DELETE/MAINTAIN defaults are intentionally left unchanged;
-- individual migrations/RLS remain responsible for actual browser data access.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
