# My Agent Air

B2B workspace for travel agents at https://agent.bifavia.uz. Built with Next.js App Router, React, TypeScript and Supabase. Vercel publishes reviewed batches from the GitHub `main` branch.

## Main workflow

Complete your profile → publish a service request → receive offers → accept one offer → manage the deal and its conversation together. Posts and announcements share one feed. The floating messenger opens conversations without leaving the current page.

The platform has both deterministic request parsing and an authenticated AI assistant. Request drafts use supported local reference data and validation; the AI chat endpoint can call OpenAI under server-side authentication and quota controls. Live fares or inventory are not implied unless a dedicated supplier integration provides them.

## Development

Use Node.js 24, matching Vercel.

```sh
npm ci
npm run dev
npm test
npm run lint
npm run build
```

The public Supabase configuration defaults to the existing project `fsemjqlreuzvpyvbmxzt`. Set these variables for a separate environment:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-public-publishable-key
NEXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY=your-public-vapid-key
```

Keep server credentials out of `NEXT_PUBLIC_*`. SMS registration uses server-only Eskiz credentials. AI, payment, push and supplier-outreach credentials also stay server-side or in the relevant provider secret store.

## Authentication

Phone registration is the primary flow: the server normalizes Uzbekistan numbers, checks password safety, validates Turnstile when configured, rate-limits requests, sends a six-digit OTP through Eskiz, and creates the Supabase Auth account only after successful verification. Email OTP registration remains available as an alternate method. Ordinary login accepts email or the registered phone number plus password and does not require an SMS code.

Password recovery supports Supabase recovery links. In Supabase Auth, configure:

- Site URL: `https://agent.bifavia.uz`
- Allowed redirect URL: `https://agent.bifavia.uz/reset-password`
- Add matching local/preview reset URLs only for controlled development tests.

The root recovery redirect handles links that land on the configured Site URL. SMTP and Supabase-native leaked-password protection are provider settings; the application additionally screens new passwords server-side. Recovery behavior is tested without sending production emails.

Database triggers and deal RPCs reject blocked accounts. Creating a request or offer requires a completed contact/company profile. Role, verification and active status remain protected by database grants and server-side checks.

## Database recovery

`supabase/schema/baseline-before-resume.sql` is a schema-only snapshot from immediately before the October 4 recovery/security work. It contains no users, business rows, OTP values, payment credentials or push secrets.

For a **fresh Supabase database only**:

1. Restore `supabase/schema/baseline-before-resume.sql`.
2. Apply `supabase/migrations/20261004113047_resume_security.sql`.
3. Apply every later SQL file in `supabase/migrations/` in filename order.
4. Configure environment-specific secrets/endpoints separately.
5. Run the SQL regression checks plus the application Quality Gate before using the environment.

Do **not** replay the baseline on production. Production's `supabase_migrations.schema_migrations` ledger remains the canonical record of what was actually applied there.

P10 restored cloud migrations that existed in production but were missing from Git recovery history, including the AI chat prerequisites, the VK aviation ingest schema/disable step, and the Click subscription payment-order foundation. The VK recovery migration intentionally omits the production-only secret hash; environment credentials must be configured separately.

`supabase/tests/resume_security.sql` verifies access, profile requirements, expiry, money constraints, system-message protection and the core deal workflow. It rolls back its fixtures and queued notifications. Identity sequences may still advance during the test.

## Verification and deployment

`npm test`, lint and production build are mandatory before release. The Quality Gate also runs browser smoke checks on Desktop, Android and iOS shells. These smoke checks cover public routes and authentication guards; they are not a substitute for a real authenticated end-to-end business-flow test.

Vercel Git deployment is disabled for non-`main` branches. P10 work is accumulated on a working branch and merged to `main` in batches so several validated changes can share one production deployment. After Vercel reports READY, verify the deployed Git SHA, `agent.bifavia.uz` alias and Production Smoke result.

Database migrations and frontend deployment are separate operations. Keep migrations backward-compatible with the currently running frontend during rollout, and never expose Supabase secret/service-role keys, Eskiz credentials or merchant secrets to the browser.
