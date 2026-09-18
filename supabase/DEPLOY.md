# Push notifications — Supabase deployment

Everything below targets the existing cloud project `fsemjqlreuzvpyvbmxzt`
(see `SUPABASE_URL` in [lib/supabase-auth.ts](../lib/supabase-auth.ts)). There
is no local Supabase dev stack in this repo — `supabase/config.toml` only
configures the `push-dispatch` Edge Function for `supabase functions deploy`.

## 0. Prerequisites

```bash
npx supabase login                       # opens a browser, creates a CLI access token
npx supabase link --project-ref fsemjqlreuzvpyvbmxzt
```

`supabase link` is required before any of the commands below will work — it
was **not** run in this sandbox (no interactive login/secrets available
here), so migration status could not be verified from this environment.

## 1. Check migration status

```bash
npx supabase migration list
```

Confirms whether `20260918120000_push_notifications.sql` is already applied
remotely. If it's only listed locally, apply it:

```bash
npx supabase db push
```

## 2. Generate VAPID keys (once per project)

```bash
npx web-push generate-vapid-keys
```

Save the `Public Key` / `Private Key` pair — the public key also goes to the
Next.js frontend (step 4).

## 3. Set Edge Function secrets

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by
the platform for every Edge Function — do **not** set them manually. Only
these need to be set explicitly:

```bash
npx supabase secrets set \
  PUSH_WEBHOOK_SECRET="<generate a random 32+ byte string, e.g. openssl rand -hex 32>" \
  PUSH_VAPID_PUBLIC_KEY="<public key from step 2>" \
  PUSH_VAPID_PRIVATE_KEY="<private key from step 2>" \
  PUSH_VAPID_SUBJECT="mailto:support@myagentair.com"
```

## 4. Deploy the Edge Function

```bash
npx supabase functions deploy push-dispatch
```

`supabase/config.toml` sets `verify_jwt = false` for this function — required
because the DB trigger authenticates with the `x-webhook-secret` header, not
a Supabase Auth JWT.

## 5. Point the DB trigger at the deployed function

Run once against the project's SQL editor / `psql` (uses the *same* secret
as `PUSH_WEBHOOK_SECRET` above):

```sql
alter database postgres set app.settings.push_edge_url = 'https://fsemjqlreuzvpyvbmxzt.functions.supabase.co/push-dispatch';
alter database postgres set app.settings.push_webhook_secret = '<same value as PUSH_WEBHOOK_SECRET>';
```

## 6. Configure the frontend

Add to the Next.js deployment's environment variables (e.g. Vercel project
settings):

```
NEXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY=<public key from step 2>
```

Redeploy the frontend after adding it — it's read at build/runtime by
[lib/push-notifications.ts](../lib/push-notifications.ts).

## What still needs manual setup

- [ ] Run `supabase login` + `supabase link` with real project credentials
      (not available in this sandbox).
- [ ] Confirm `20260918120000_push_notifications.sql` is applied remotely
      (`supabase migration list`) and run `supabase db push` if not.
- [ ] Generate real VAPID keys and store them securely (password manager /
      team secrets vault) — the ones in this doc are placeholders.
- [ ] Set the four Edge Function secrets in step 3 on the real project.
- [ ] Deploy the function (step 4) and verify with `supabase functions logs push-dispatch`.
- [ ] Run the two `alter database` statements in step 5 with the matching
      secret value.
- [ ] Add `NEXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY` to the frontend hosting
      provider's env vars and redeploy.
- [ ] End-to-end smoke test: send a chat message / offer / request and
      confirm a push notification is received on a subscribed device.
