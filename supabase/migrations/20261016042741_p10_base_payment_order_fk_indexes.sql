-- P10 base hardening: cover payment-order foreign keys before merchant traffic starts.
create index if not exists billing_payment_orders_plan_code_idx
  on public.billing_payment_orders(plan_code);

create index if not exists billing_payment_orders_subscription_id_idx
  on public.billing_payment_orders(subscription_id);
