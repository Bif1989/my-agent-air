# My Agent Air

B2B workspace for travel agents at https://agent.bifavia.uz. Built with Next.js App Router, React, TypeScript and Supabase. Vercel publishes the GitHub `main` branch.

## Main workflow

Complete your profile → publish a service request → receive offers → accept one offer → manage the deal and its conversation together. Posts and announcements share one feed. The floating messenger opens conversations without leaving the current page.

The request assistant prepares a draft from supported city/airport names, dates, passenger counts, baggage and budgets. It uses local reference data and parsing rules, makes no paid model calls, and publishes only when the user submits the form. It does not fetch live fares or inventory.

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

Keep server credentials out of `NEXT_PUBLIC_*`. VK login requires the server-side variables used in `app/api/auth/vk/route.ts`; push dispatch uses its own Edge Function secrets.

## Authentication

Email signup verifies a six-digit OTP and opens profile completion. Password recovery supports Supabase implicit recovery and token-hash links. In Supabase Auth, configure:

- Site URL: `https://agent.bifavia.uz`
- Allowed redirect URL: `https://agent.bifavia.uz/reset-password`
- Add the matching local and preview reset URLs for email delivery tests.

The root recovery redirect handles links that land on this site's configured Site URL. SMTP and leaked-password protection are provider settings; this repository does not change them. Recovery REST behavior is tested without sending production emails.

Database triggers and deal RPCs reject blocked accounts. Creating a request or offer requires a completed contact/company profile. Role, verification and active status remain protected by column grants.

## Database recovery

`supabase/schema/baseline-before-resume.sql` exports the schema before the October 4 fixes: tables, constraints, indexes, RLS policies, functions, triggers, grants and realtime membership. No users, application rows or push secrets are included.

For a **fresh Supabase database only**, run the baseline and then `supabase/migrations/20261004113047_resume_security.sql`. Do not replay the baseline or the old push migration on production. Earlier cloud migrations are represented by the combined snapshot, not fabricated migration history. Configure the new project's push endpoint and secret separately.

Production migration `20261004113047_resume_security` preserves existing data and adds active-account checks, expiry checks, finite nonnegative money constraints, supported currencies, serialized/idempotent offer acceptance and aggregated agent filters.

`supabase/tests/resume_security.sql` verifies access, profile requirements, expiry, money constraints, system-message protection and the full deal workflow. It rolls back fixtures and queued notifications. Identity sequences may advance during the test.

## Verification and deployment

`npm test` covers refresh concurrency, outages, logout races, retry headers, idempotent messages, cursors, safe redirects, expiry, assistant input and service-detail editing. Use mocked API fixtures for authenticated browser checks, so tests never send real messages or recovery emails. Browser verification was blocked in the current execution environment; do not infer visual/hydration success from the build.

Before pushing `main`, run tests, lint and build. After Vercel reports READY, verify its Git SHA and the `agent.bifavia.uz` alias. Database and frontend changes deploy separately; preserve migration compatibility during rollout.
