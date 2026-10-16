# CLICK monetization integration

My Agent Air (`agent.bifavia.uz`) and Avia Market use separate CLICK service credentials. Production credentials and secrets must never be committed to Git or copied between the two Vercel projects.

## My Agent Air production environment

Server-only variables:

- `CLICK_SERVICE_ID`
- `CLICK_MERCHANT_ID`
- `CLICK_MERCHANT_USER_ID`
- `CLICK_SECRET_KEY` — Vercel Secret only
- `CLICK_ENABLED` — keep `false` until callback registration/testing is complete
- `CLICK_PAYMENT_URL=https://my.click.uz/services/pay`
- `CLICK_RETURN_URL=https://agent.bifavia.uz/billing/subscription?payment=click`

Do not create any `NEXT_PUBLIC_CLICK_*` secret.

## Shop API callback URLs

Register these HTTPS endpoints for the My Agent Air CLICK service:

- Prepare: `https://agent.bifavia.uz/api/payments/click/prepare`
- Complete: `https://agent.bifavia.uz/api/payments/click/complete`

Both paths are handled by one dynamic Next.js route so the Vercel function surface stays small.

## Subscription flow

1. An authenticated user starts payment from `/billing/subscription`.
2. The server reads the active `monthly_unlimited` plan and price from Supabase; it does not accept the amount from the browser.
3. The server creates a `billing_payment_orders` row and returns a CLICK hosted-payment URL using the generated `order_ref` as `transaction_param`.
4. CLICK sends Prepare (`action=0`). The server validates the signature, service, order, amount and transaction, then calls `prepare_billing_click_order`.
5. CLICK sends Complete (`action=1`). The server rechecks the signature, amount and prepare ID, then calls `complete_billing_click_order`.
6. The database function creates the subscription atomically and duplicate Complete requests reuse the already-paid result instead of creating another subscription.
7. Failed/cancelled CLICK callbacks use `cancel_billing_click_order`.

`CLICK_ENABLED` controls new user-initiated payments. Callback verification is credential-based and remains independent so CLICK retries can still be acknowledged safely.

## Release rule

Keep this work deploy-free until the payment batch is validated. Before enabling production payments:

- confirm CLICK has registered the Prepare/Complete URLs for the correct My Agent Air service;
- run unit/lint/build/browser quality gates;
- verify the reviewed billing indexes and least-privilege migration are applied;
- run Supabase security/performance advisors;
- enable `CLICK_ENABLED=true` only for `my-agent-air` after callback registration is ready;
- perform one controlled test/real payment and verify order, subscription and idempotency;
- deploy/promote once as the final batched release.
