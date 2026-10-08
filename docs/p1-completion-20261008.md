# P1 continuation — 2026-10-08

## Changes

- All six auth endpoints enforce actual streamed JSON byte limits, including absent or misleading Content-Length. Interrupted and malformed bodies fail validation.
- Turnstile rejects successful responses with missing, malformed, or mismatched hostnames when an expected hostname is supplied.
- Pwned Passwords screening ignores zero-count padding entries.
- Production Smoke now verifies all six cross-site auth guards, no-store responses, and the recovery session requirement. These checks do not create users, send email, or consume AI credits.

## Verification before release

- 84 tests passed, including chunked recovery payload rejection and CAPTCHA hostname regressions.
- Lint: zero errors; two existing warnings (PWA image and unused test import).
- Production build passed.
- Live auth guard smoke passed.
- Live database: zero public tables without RLS; all three auth quota RPCs are executable only by service_role, not anon/authenticated.
- Transactional quota test passed: action quota blocks the next attempt; five failed login attempts block the pair; successful login clears that pair. All test changes rolled back.
- Previous head 95afcd2: Quality Gate, Production Smoke, and Vercel deployment succeeded. Quality Gate includes desktop Chromium, Android Chromium and iOS WebKit emulation, not physical-device testing.

## Remaining account-level work — P1 is not fully closed

- Vercel connector returns 403 for team_NOqkxVA4ZxJTLFkZ8azKAjmF / prj_SllgqoRhlQAds8rPzbH0dz135Ovr; CLI has no credentials. Environment configuration and function logs could not be inspected.
- Verify production Turnstile keys and complete a real challenge. Code intentionally leaves CAPTCHA disabled when both keys are absent; support in code does not establish activation. Configure both NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY together and redeploy.
- Supabase advisor still reports native leaked-password protection disabled. Application screening is not an equivalent control: it fails open on provider outage and does not protect direct Supabase Auth calls.
- Require Quality Gate on main through GitHub branch protection/rulesets. Ruleset listing returned empty; administration writes are not available through this connector.
- Native Supabase CAPTCHA/rate limits must also be reviewed because browser-visible Supabase Auth endpoints remain directly reachable, independently of application route limits.
- Authenticated real-device login/recovery/voice end-to-end checks and complete Vercel error-log review remain unverified.

Provider references: https://haveibeenpwned.com/API/v3#PwnedPasswords and https://developers.cloudflare.com/turnstile/get-started/server-side-validation/.
