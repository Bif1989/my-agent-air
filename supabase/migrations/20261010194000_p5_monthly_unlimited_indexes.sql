-- P5.3 follow-up indexes for foreign-key maintenance and admin lookups.

create index if not exists billing_subscription_plans_updated_by_idx
  on public.billing_subscription_plans (updated_by);

create index if not exists billing_subscriptions_plan_code_idx
  on public.billing_subscriptions (plan_code);
