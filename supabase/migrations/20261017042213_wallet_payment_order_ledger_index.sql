create index if not exists billing_payment_orders_wallet_ledger_id_idx
  on public.billing_payment_orders(wallet_ledger_id)
  where wallet_ledger_id is not null;
