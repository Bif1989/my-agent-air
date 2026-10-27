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

## P1 delivery and recovery follow-up

Apply `20261027021829_supplier_delivery_recovery_p1.sql` before promoting the new
runtime. Never replay or edit previously applied migrations. The new SMS runtime
fails closed if its begin/finish RPCs are unavailable.

Outstanding email recipients now resolve from the current supplier email on invite
creation/reissue, supplier contact edits, and suppression insert/update/delete.
This replaces stale provenance, follows the complete replacement chain, rejects
cycles, and preserves failed status during recovery. It never sends a message.
Suppression changes re-evaluate outstanding email invites once per SQL statement.

SMS begin validates the live claim, token, recipient, request, supplier opt-out and
inactive status, then persists `sms_delivery_pending` before the provider request.
Claim expiry/release and invite recreation cannot clear this marker. Transport
errors, HTTP 408/409/5xx, missing provider IDs, failed completion writes, and worker
termination require reconciliation; they never trigger a blind retry. Explicit
request rejection can clear the marker through the service-only completion RPC.

Support reconciliation:

1. Read the invite ID, `sms_delivery_attempt_id`, `sms_delivery_started_at`, recipient
   and `sms_delivery_pending` using a trusted service connection.
2. Verify the outcome against Eskiz records. An absent local receipt, elapsed time,
   or a failed HTTP response alone does not prove that SMS was not accepted.
3. For verified acceptance, call `finish_supplier_sms_delivery` with the exact invite
   and attempt IDs, `p_outcome='accepted'`, and the verified `p_provider_id`.
   For verified rejection/non-acceptance, use `p_outcome='rejected'` and a null ID.
   Unknown results remain pending. Browser roles cannot execute this function.
4. Check the RPC returned true and reload the invite. Accepted attempts become sent;
   rejected attempts become failed and can be deliberately retried.

Run the third SQL suite `tests/integration/supplier-delivery-recovery-p1.cjs` as well
as the existing two suites. It exercises the actual invite and claim functions,
contact corrections, legacy replacements, chains, unknown-attempt persistence,
reissue blocking, inactive/opt-out checks, and completion permissions. Only crypto
primitives and prerequisite account/date/phone helpers are shimmed in this isolated
fixture; it does not replace a complete Supabase migration reset or live receipt test.
