-- P10 staged SQL. Apply through the Supabase migration workflow during the
-- Click/Payme database rollout, then record the generated migration in the repo.
-- These indexes address current Supabase performance advisor findings for
-- billing_payment_orders foreign keys.

create index if not exists billing_payment_orders_plan_code_idx
  on public.billing_payment_orders(plan_code);

create index if not exists billing_payment_orders_subscription_id_idx
  on public.billing_payment_orders(subscription_id)
  where subscription_id is not null;

-- Post-migration verification:
-- rerun Supabase performance advisors; the two unindexed_foreign_keys findings
-- for billing_payment_orders should disappear.
