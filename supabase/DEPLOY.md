# Supabase operations

Production project: `fsemjqlreuzvpyvbmxzt`.

## Source of truth

Production's `supabase_migrations.schema_migrations` ledger is the canonical record of migrations actually applied to the live database. The repository is the recovery/development source and must contain every schema prerequisite needed to rebuild a fresh environment.

`schema/baseline-before-resume.sql` is a schema-only snapshot from immediately before the October 4 security/resume work. It is a **fresh-database bootstrap/reference only** and must never be replayed on production.

## Fresh database recovery

For a new empty Supabase project only:

1. Restore `schema/baseline-before-resume.sql`.
2. Apply `migrations/20261004113047_resume_security.sql`.
3. Apply every later `.sql` file in `migrations/` in filename order.
4. Configure project-specific secrets, URLs and provider credentials separately.
5. Run `tests/resume_security.sql` and the application Quality Gate.
6. Verify RLS/advisors and browser-role grants before exposing the environment to users.

P10 restored cloud migrations that were present in production history but absent from Git recovery history:

- `20261005093623_add_ai_chat_history.sql`
- `20261005104810_add_ai_chat_conversations.sql`
- `20261013114437_vk_aviation_message_ingest.sql`
- `20261013121856_disable_legacy_vk_ingest.sql`
- `20261014045917_click_subscription_payment_orders.sql`

The VK recovery file deliberately does not seed the production secret hash. The immediately following historical migration leaves that legacy ingest function unavailable to browser roles. Configure any environment-specific secret only through the environment's secret/config workflow.

Do not copy live user rows, OTP records, payment secrets, push subscriptions or provider credentials into a development database.

## Registration SMS

Phone signup uses `registration_sms_otps` as a server-only challenge store. Browser roles have no table privileges; only the server/service role handles OTP lifecycle. Eskiz credentials (`ESKIZ_EMAIL`, `ESKIZ_PASSWORD`, optional approved sender) must remain server-side. Never commit them or expose them with `NEXT_PUBLIC_*`.

## Payment integrations

Click is live for the Agent billing flow. Merchant/service credentials and the Click secret remain server-only. Prepare/Complete callbacks verify provider signatures and bind the callback to the stored order amount, order reference and purpose. Wallet top-up completion is idempotent and writes an immutable wallet ledger entry; subscription fulfillment uses the same payment-order foundation. Payme is not enabled unless a separate provider rollout explicitly configures and tests it.

The historical Click migration created the service-role-only prepare/complete/cancel foundation. Later wallet/subscription migrations extend it without exposing merchant credentials. P10 base migrations `20261016042735_p10_base_browser_least_privilege.sql` and `20261016042741_p10_base_payment_order_fk_indexes.sql` were applied to production; the files under `supabase/p10/` are review references, not pending production SQL.

P10 closeout migration `20261017081851_p10_closeout_default_privilege_hardening.sql` removes `TRUNCATE`, `REFERENCES` and `TRIGGER` from browser roles on the wallet tables and changes the `postgres` public-table default ACL so later `postgres`-owned tables do not inherit those structural privileges. The managed `supabase_admin` default ACL is provider-owned and cannot be changed by the `postgres` role through the project connector; any future object owned by that role must therefore be reviewed explicitly with the privilege scan/advisors.

## Push dispatch

Deploy `functions/push-dispatch` using the Supabase CLI or connector. `config.toml` disables platform JWT verification; the handler verifies the shared `x-webhook-secret` header.

Set Edge Function secrets `PUSH_WEBHOOK_SECRET`, `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY` and `PUSH_VAPID_SUBJECT` in the environment's secret manager. The frontend reads only `NEXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY`. Supabase supplies the function's Supabase URL and server key in the function environment.

The production trigger reads the webhook secret from `private_push.config`, unavailable to browser roles. Do not replace it with the old database-setting variant or commit the secret. On a new project, update the trigger's Edge Function URL and configure the same secret in the private table and Edge Function.

The baseline contains no usable secret, so fresh databases send no pushes until configured.

## Security regression check

Run `tests/resume_security.sql` after the recovery chain is applied. Its temporary fixtures and queued notifications are rolled back. It verifies the successful deal flow and rejects unauthorized, blocked, expired and invalid-money operations.

Also run database advisors and a direct privilege scan. For `anon` and `authenticated`, public application tables should not retain `TRUNCATE`, `TRIGGER` or `REFERENCES` unless a reviewed use case explicitly requires them. Advisor output is not expected to be empty: service-only RLS tables can intentionally have no browser policy, public token-based supplier invite RPCs are intentionally anonymous, and authenticated security-definer RPCs must be evaluated by their internal ownership/admin checks rather than blanket-revoked.
