create index if not exists avia_market_subscriptions_plan_code_idx
  on private.avia_market_subscriptions(plan_code);

create index if not exists avia_market_wallet_ledger_subscription_id_idx
  on private.avia_market_wallet_ledger(subscription_id)
  where subscription_id is not null;
