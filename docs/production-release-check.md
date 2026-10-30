# Production release verification

Git auto-deploy is disabled. Production Smoke is therefore manual, after the
authorized release, with the exact full commit SHA in `expected_sha`. A push alone
must not produce a misleading successful check against the old production site.

Build with `RELEASE_COMMIT_SHA` set to the exact reviewed checkout SHA when using
prebuilt releases. Vercel Git builds can use `VERCEL_GIT_COMMIT_SHA` instead. The
build records it in the `X-Release-Commit` response header, with no new Function.
Never reuse a build for another commit. The deployment procedure must verify the
checkout is clean and the variable matches HEAD before building.

Run Production Smoke from a main revision containing these workflow changes only
after the new production release has been promoted. Enter its full SHA. Missing or
mismatched headers fail the check before route/auth probes. Old deployments without
the header deliberately fail; HTTP availability alone is not release verification.

This change can ship with other verified site fixes. It does not depend on Meta,
CRM schemas or Edge Functions. PR #60's marketing migration remains held while CRM
integration is postponed; do not apply it as part of this independent change.
