# P10 final closeout — 2026-10-17

P10 closes the Agent/My Agent Air hardening, recovery, billing and production-verification batch.

## Production runtime

- Site: `https://agent.bifavia.uz`
- Vercel project: `my-agent-air`
- Production deployment: `dpl_FANVJuh3d5cRUxAobsnwpVmcCyod`
- Runtime Git commit: `f5662f440251408ec6393174aed93d878a4733f0`
- Deployment state at closeout: `READY`
- `agent.bifavia.uz` is assigned to that deployment with no alias error.
- Vercel 24-hour runtime error aggregation returned no error clusters during the closeout audit.

The final closeout branch changes only recovery SQL, regression tests and documentation. They do not change the Next.js runtime, so no additional Vercel production deployment is required solely for this closeout merge.

## Authenticated production-schema E2E

A rollback-only transaction was executed against the live Supabase database using the actual production schema, RLS and RPC functions. No fixture was committed.

Validated path:

1. authenticated buyer creates a request;
2. Geo Tender refresh produces the intended supplier target;
3. authenticated seller submits an offer;
4. buyer accepts the same offer twice and receives the same deal ID (idempotency);
5. both participants write to the deal conversation;
6. deal moves through `processing → issued → completed`;
7. billing records exist for both participants and buyer/seller role snapshots are present;
8. buyer submits a completed-deal review.

Result:

`PASS: authenticated request -> matching -> offer -> idempotent accept -> deal -> two-way chat -> completed billing -> review; transaction rolled back`

A follow-up read verified that zero P10 audit requests, offers, messages or reviews remained.

## Billing and payment invariants

Read-only production checks found:

- negative wallet balances: `0`
- duplicate deal-fee rows per deal/user: `0`
- duplicate referral rewards per referred-user/beneficiary/level: `0`
- duplicate Click order references: `0`
- duplicate Click transaction IDs: `0`
- paid wallet top-up orders without a wallet ledger row: `0`
- paid subscription orders without a subscription row: `0`

Wallet settings at closeout:

- wallet mode: enabled
- lifetime free deal limit: `5`
- low-balance warning: `10,000 UZS`
- top-up minimum: `5,000 UZS`

## P10 least-privilege closeout

A final direct grant scan discovered that wallet tables created after the earlier P10 least-privilege migration had inherited PostgreSQL structural privileges for browser roles.

Production migration `20261017081851_p10_closeout_default_privilege_hardening` was applied and is recovered in Git as:

`supabase/migrations/20261017081851_p10_closeout_default_privilege_hardening.sql`

It:

- revokes `TRUNCATE`, `REFERENCES` and `TRIGGER` from `anon` and `authenticated` on `billing_settings`, `billing_wallets` and `billing_wallet_ledger`;
- changes the `postgres` default ACL for future public tables so those structural privileges are not inherited by browser roles.

Post-migration verification found zero current `TRUNCATE`, `TRIGGER` or `REFERENCES` table grants to `anon`/`authenticated` in the `public` schema.

The managed `supabase_admin` default ACL is owned by the platform role and cannot be changed by the project's `postgres` role through the connector. Future objects owned by `supabase_admin` therefore still require an explicit privilege/advisor review.

## Supabase advisor status

The advisor output is intentionally **not described as clean**. Remaining notices at closeout are known and require interpretation rather than blanket deletion:

- RLS enabled/no-policy INFO for server/private tables including `registration_sms_otps`, `vk_aviation_messages` and `app_private.support_threads`; browser table grants are intentionally absent for the server-only tables.
- three anonymous `SECURITY DEFINER` supplier-invite RPC warnings; these are token-based public invite flows and must remain protected by their high-entropy token validation.
- authenticated `SECURITY DEFINER` RPC warnings for application/admin workflows; these functions must retain their internal identity/ownership/admin checks and should be reviewed individually before any privilege change.
- Supabase native leaked-password protection remains disabled at provider level. The application separately performs server-side Have I Been Pwned password screening, but enabling the native provider control remains an account-level defense-in-depth option.
- performance advisor findings at closeout are unused-index INFO items; no missing billing foreign-key index warning remains.

## Realtime and release checks

- Production Realtime logs in the audit window contained no messages matching `error`, `fail` or `invalid`.
- P10.6 Quality Gate passed 242/242 tests, lint, production build, Desktop Chromium smoke, Android Chromium smoke and iOS WebKit smoke.
- Automatic non-main Vercel Git deployments remain disabled so releases can be batched on the Hobby plan.

## Closeout definition

P10 is considered complete when this closeout branch passes the repository Quality Gate, is merged to `main`, and the obsolete draft P10 PR is closed as superseded. The Agent runtime does not need a redundant Vercel redeploy if those merged changes remain documentation/test/recovery-only.
