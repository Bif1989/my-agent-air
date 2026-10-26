# Outreach release checks

The historical suppression guard filename is aligned with the already applied
production migration version 20261025235613. Do not repair production migration
history or replay the historical migration. Review pending migrations before release.

The new recovery migration preserves the original suppressed address, resolves
replacement chains, blocks cycles, and restores a known recipient without changing
failed status to queued. It does not send messages. Old null recipients are restored
only if the supplier still identifies the suppressed source email.

Run npm test, npm run lint, npm run build and both tests/integration supplier scripts
with PGlite available on NODE_PATH. CI runs these checks plus Chromium/WebKit smoke.
Browser smoke uses mocked statistics and CAPTCHA; it does not prove real email
receipt, logged-in profile updates or production environment configuration.

A missing profile row is now reported explicitly. The browser must not manufacture
a new active account, role, verification status or business data to repair it.
Support should verify the auth identity and restore the original profile safely.

Before release, test the actual public statistics endpoint and authenticated profile
save/reload using a test account. Verify another user's profile and protected fields
cannot be updated. Test an installed PWA upgrade. The current public/sw.js handles
push notifications only and has no fetch or cache handler.

Email delivery refreshes current state immediately before contacting the provider.
A suppression committed after the provider request starts cannot recall that email;
this is a remaining distributed-system boundary, not an atomic DB/provider transaction.
No production migrations or deployment are performed by this PR.
