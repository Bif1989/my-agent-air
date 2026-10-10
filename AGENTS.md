<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Deployment-budget rules

- Keep production on `main`, but do iterative work on the long-lived `dev` branch whenever possible.
- Batch related fixes and features together; do not push a sequence of tiny/no-op commits to `main`.
- Before merging to `main`, run tests, lint and build. Prefer one verified squash/merge to `main` for a batch of changes so one batch causes one production deployment.
- Vercel preview deployments are intentionally disabled for non-`main` branches in `vercel.json` to preserve Hobby-plan deployment quota.
- Vercel's ignored-build command intentionally skips production builds when only docs, tests, GitHub workflow files, or Supabase migration files changed. Keep runtime paths in that command in sync if the app structure changes.
