# Supabase operations

Production project: `fsemjqlreuzvpyvbmxzt`. Its core schema, RLS, grants and RPCs are recorded in `schema/baseline-before-resume.sql`. This is a fresh-database bootstrap/reference, never a migration to replay on production. See the main README for recovery order and verification.

## Applied migrations

Production has the original core/group/feed migrations, `20260918103053_push_notifications`, `20260918111732_use_private_push_config_table`, `20260921031336_add_vk_identities` and `20261004113047_resume_security`. The older local `20260918120000_push_notifications.sql` is a historical setup example with a different timestamp; do not apply it again to this project.

## Push dispatch

Deploy `functions/push-dispatch` using the Supabase CLI or connector. `config.toml` disables platform JWT verification; the handler verifies the shared `x-webhook-secret` header.

Set Edge Function secrets `PUSH_WEBHOOK_SECRET`, `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY` and `PUSH_VAPID_SUBJECT` in the environment's secret manager. The frontend reads `NEXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY`. Supabase supplies the function's Supabase URL and service role key.

The production trigger reads the webhook secret from `private_push.config`, unavailable to browser roles. Do not replace it with the old migration's database-setting variant or commit the secret. On a new project, update the trigger's Edge Function URL and configure the same secret in the private table and Edge Function.

The snapshot contains an empty secret, so fresh databases send no pushes until configured. Do not copy production subscriptions, user rows or credentials into development databases.

## Security regression check

Run `tests/resume_security.sql` after applying `resume_security`. Its temporary fixtures and queued notifications are rolled back. It verifies the successful deal flow and rejects unauthorized, blocked, expired and invalid-money operations.
