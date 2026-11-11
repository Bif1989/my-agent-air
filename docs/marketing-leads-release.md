# Marketing leads release batch (held, not deployed)

Include PR #60's admin leads lint fix and the marketing lead upsert index migration.
The deployed webhook already uses `onConflict: "leadgen_id", ignoreDuplicates: true`;
only the index needs replacing. Do not redeploy the Edge Function for this fix.

## Release order after user authorization

1. Confirm the exact reviewed commit has a green full Quality Gate, including the
   marketing SQL integration suite. Review production migration history again.
2. Apply only `20261030035952_marketing_leads_upsert_index.sql` using the migration
   runner's transaction. It builds the full unique index before dropping the partial
   one. This takes a write lock; current inspection found zero leads, but recheck
   table size and schedule appropriately if traffic has grown.
3. Verify the index is valid and `EXPLAIN INSERT ... ON CONFLICT (leadgen_id) DO NOTHING`
   succeeds, without executing the insert. Confirm existing rows and grants remain.
4. Release the verified application batch with the admin leads lint fix.
5. With separate authorization to create test records, send a Meta test lead through
   the real subscribed Page/form. Confirm one CRM row, then replay the same delivery
   and verify no duplicate and no reset of operator status/notes. Local SQL tests
   do not prove Meta subscription, token permissions or signature configuration.

## Recovery

A failed transactional migration rolls back. After success, retain the compatible
index even if the application is rolled back: reverting to the partial index would
restore the deployed webhook's 42P10 failure. No rows are deleted by this migration.
