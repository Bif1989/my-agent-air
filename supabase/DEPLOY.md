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
6. Verify RLS/advisors before exposing the environment to users.

P10 restored two original cloud migrations that were missing from Git history:

- `20261005093623_add_ai_chat_history.sql`
- `20261005104810_add_ai_chat_conversations.sql`

The later AI-history hardening files assume those tables already exist, so these restored files are required for deterministic fresh recovery.

Do not copy live user rows, OTP records, payment secrets, push subscriptions or provider credentials into a development database.

## Registration SMS

Phone signup uses `registration_sms_otps` as a server-only challenge store. Browser roles have no table privileges; only the server/service role handles OTP lifecycle. Eskiz credentials (`ESKIZ_EMAIL`, `ESKIZ_PASSWORD`, optional approved sender) must remain server-side. Never commit them or expose them with `NEXT_PUBLIC_*`.

## Payment integrations

Merchant secrets for Click/Payme must be configured only after the provider has issued the final merchant/service identifiers and credentials. Webhook/provider callbacks must be verified server-side and processed idempotently. Payment database migrations and frontend release should remain backward-compatible while old production code is still serving traffic.

## Push dispatch

Deploy `functions/push-dispatch` using the Supabase CLI or connector. `config.toml` disables platform JWT verification; the handler verifies the shared `x-webhook-secret` header.

Set Edge Function secrets `PUSH_WEBHOOK_SECRET`, `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY` and `PUSH_VAPID_SUBJECT` in the environment's secret manager. The frontend reads only `NEXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY`. Supabase supplies the function's Supabase URL and server key in the function environment.

The production trigger reads the webhook secret from `private_push.config`, unavailable to browser roles. Do not replace it with the old database-setting variant or commit the secret. On a new project, update the trigger's Edge Function URL and configure the same secret in the private table and Edge Function.

The baseline contains no usable secret, so fresh databases send no pushes until configured.

## Security regression check

Run `tests/resume_security.sql` after the recovery chain is applied. Its temporary fixtures and queued notifications are rolled back. It verifies the successful deal flow and rejects unauthorized, blocked, expired and invalid-money operations.

Also run database advisors and confirm that every table in exposed schemas has the intended RLS and least-privilege grants before release.
