-- Authenticated clients submit/read reviews only through the narrow RPCs.
-- Keep the table itself explicitly deny-by-default so the RLS intent is auditable.

drop policy if exists deal_reviews_no_direct_access on public.deal_reviews;
create policy deal_reviews_no_direct_access
  on public.deal_reviews
  for all
  to authenticated
  using (false)
  with check (false);
